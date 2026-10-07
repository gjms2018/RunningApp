import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { ValidacionHistorialService } from './validacion-historial.service';
import { AuditoriaService } from '../audit/services/auditoria.service';
import { RequestContextService } from '../audit/services/request-context.service';

interface InscribirseDto {
  idCarrera: string;
  idEquipoRepresentado?: string;
  /**
   * Si se omite, el corredor inscrito es el propio actor autenticado
   * (caso normal: un adulto inscribiéndose a sí mismo). Si se envía,
   * debe ser un id_usuario presente en `corredoresGestionados` del
   * actor — es decir, el Tutor inscribiendo a UNO DE SUS menores, sin
   * que el menor necesite iniciar sesión en ningún momento.
   */
  idUsuarioCorredor?: string;
}

@Injectable()
export class InscripcionesService {
  constructor(
    private dataSource: DataSource,
    private validacionHistorial: ValidacionHistorialService,
    private auditoriaService: AuditoriaService,
    private requestContext: RequestContextService,
  ) {}

  async inscribirse(dto: InscribirseDto): Promise<{ idInscripcion: string }> {
    const {
      idUsuario: idUsuarioActor,
      direccionIp,
      userAgent,
      corredoresGestionados,
    } = this.requestContext.getAutenticado();

    // Determina a nombre de quién se crea la inscripción, y valida
    // autoridad si el actor está gestionando a un menor distinto de sí
    // mismo. Esta validación vive en el SERVICIO (no solo en el
    // controller) para que sea imposible de saltarse aunque cambie el
    // punto de entrada HTTP en el futuro.
    const idUsuarioCorredor = dto.idUsuarioCorredor ?? idUsuarioActor;

    if (idUsuarioCorredor !== idUsuarioActor) {
      if (!corredoresGestionados.includes(idUsuarioCorredor)) {
        throw new ForbiddenException(
          'No tienes autoridad de tutor sobre este corredor',
        );
      }
    }

    return this.dataSource.transaction(async (manager) => {
      // 1. Bloqueo pesimista sobre la carrera — necesario para el
      // control de cupos concurrente: si 500 corredores intentan
      // inscribirse al mismo tiempo con 1 cupo disponible, este FOR
      // UPDATE serializa las transacciones y evita la sobreventa.
      // El CHECK (cupos_disponibles >= 0) en el DDL es la última línea
      // de defensa si, por lo que sea, esta capa fallara.
      const carreraFilas = await manager.query(
        `SELECT id_carrera, cupos_disponibles, estado_evento, costo_inscripcion
         FROM carreras WHERE id_carrera = $1 FOR UPDATE`,
        [dto.idCarrera],
      );

      if (carreraFilas.length === 0) {
        throw new NotFoundException('Carrera no encontrada');
      }

      const carrera = carreraFilas[0];

      if (carrera.estado_evento !== 'programada') {
        throw new BadRequestException(
          `No es posible inscribirse: la carrera está en estado '${carrera.estado_evento}'`,
        );
      }

      if (carrera.cupos_disponibles <= 0) {
        throw new ConflictException('No hay cupos disponibles para esta carrera');
      }

      // 2. Evitar doble inscripción DEL CORREDOR (no del actor — un
      // Tutor puede inscribir a varios de sus hijos a la misma carrera
      // sin que eso cuente como "doble inscripción").
      const yaInscrito = await manager.query(
        `SELECT 1 FROM inscripciones WHERE id_usuario = $1 AND id_carrera = $2`,
        [idUsuarioCorredor, dto.idCarrera],
      );

      if (yaInscrito.length > 0) {
        throw new ConflictException('Este corredor ya está inscrito en esta carrera');
      }

      // 3. Motor de validación de historial — evaluado sobre el
      // HISTORIAL DEL CORREDOR, no del actor. Un Tutor sin ningún 10K
      // en su propio historial puede perfectamente inscribir a su hijo
      // a un 10K si el hijo sí cumple el requisito.
      const elegibilidad = await this.validacionHistorial.evaluar(
        manager,
        idUsuarioCorredor,
        dto.idCarrera,
      );

      if (!elegibilidad.elegible) {
        throw new ForbiddenException(elegibilidad.motivo);
      }

      // 4. Si se eligió representar a un equipo, confirmar que el
      // CORREDOR (no el actor) realmente pertenece a ese equipo.
      if (dto.idEquipoRepresentado) {
        const esMiembro = await manager.query(
          `SELECT 1 FROM miembros_equipo WHERE id_usuario = $1 AND id_equipo = $2`,
          [idUsuarioCorredor, dto.idEquipoRepresentado],
        );

        if (esMiembro.length === 0) {
          throw new ForbiddenException(
            'El corredor no pertenece al equipo que se intenta representar en esta carrera',
          );
        }
      }

      // 5. Crear la inscripción — id_usuario es el CORREDOR
      const idInscripcion = randomUUID();

      await manager.query(
        `INSERT INTO inscripciones
          (id_inscripcion, id_usuario, id_carrera, id_equipo_representado,
           estado_pago, estado_carrera)
         VALUES ($1, $2, $3, $4, 'pendiente_pago', 'inscrito')`,
        [idInscripcion, idUsuarioCorredor, dto.idCarrera, dto.idEquipoRepresentado ?? null],
      );

      // 6. Descontar el cupo — misma transacción, misma fila ya
      // bloqueada por el FOR UPDATE del paso 1.
      await manager.query(
        `UPDATE carreras SET cupos_disponibles = cupos_disponibles - 1
         WHERE id_carrera = $1`,
        [dto.idCarrera],
      );

      // 7. Auditoría tipo B — el idUsuario registrado como actor es
      // SIEMPRE quien ejecutó la acción (el Tutor si gestionó en
      // nombre de un menor), mientras que idRegistroAfectado sigue
      // siendo la fila de inscripción del corredor. Así queda
      // trazabilidad completa de "quién hizo qué en nombre de quién".
      await this.auditoriaService.registrar({
        manager,
        idUsuario: idUsuarioActor,
        tabla: 'inscripciones',
        idRegistroAfectado: idInscripcion,
        tipoOperacion: 'crear',
        valoresAnteriores: null,
        valoresNuevos: {
          id_usuario_corredor: idUsuarioCorredor,
          id_carrera: dto.idCarrera,
          id_equipo_representado: dto.idEquipoRepresentado ?? null,
          estado_pago: 'pendiente_pago',
          estado_carrera: 'inscrito',
          gestionado_por_tutor: idUsuarioCorredor !== idUsuarioActor,
        },
        direccionIp,
        userAgent,
        origenModificacion: 'usuario',
      });

      return { idInscripcion };
    });
  }
}
