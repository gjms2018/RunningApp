import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditoriaService } from '../../audit/services/auditoria.service';
import { RequestContextService } from '../../audit/services/request-context.service';

interface CargarResultadoDto {
  idInscripcion: string;
  tiempoOficial: string; // formato HH:MM:SS
  estadoCarrera: 'finalizado' | 'dnf' | 'dns';
}

/**
 * Ejemplo end-to-end del patrón de auditoría tipo B aplicado a
 * `inscripciones`. El mismo patrón se repite para `descuentos_inscripcion`
 * y `liquidaciones`.
 *
 * Puntos clave:
 *  1. Lee el estado ANTES de modificar (para valores_anteriores).
 *  2. Ejecuta el cambio de negocio.
 *  3. Escribe la fila de auditoría.
 *  4. Los pasos 2 y 3 van en la MISMA transacción — si falla la
 *     auditoría, se revierte también el cambio de negocio.
 */
@Injectable()
export class CargarResultadoService {
  constructor(
    private dataSource: DataSource,
    private auditoriaService: AuditoriaService,
    private requestContext: RequestContextService,
  ) {}

  async ejecutar(dto: CargarResultadoDto): Promise<void> {
    const { idUsuario, direccionIp, userAgent } = this.requestContext.get();

    await this.dataSource.transaction(async (manager) => {
      // 1. Estado ANTES del cambio
      const inscripcionActual = await manager.query(
        `SELECT estado_carrera, tiempo_oficial
         FROM inscripciones WHERE id_inscripcion = $1
         FOR UPDATE`, // bloqueo pesimista: evita carga doble concurrente
        [dto.idInscripcion],
      );

      if (inscripcionActual.length === 0) {
        throw new NotFoundException('Inscripción no encontrada');
      }

      const valoresAnteriores = inscripcionActual[0];

      // 2. Cambio de negocio
      await manager.query(
        `UPDATE inscripciones
         SET tiempo_oficial = $1,
             estado_carrera = $2,
             resultado_cargado_por_id_usuario = $3
         WHERE id_inscripcion = $4`,
        [dto.tiempoOficial, dto.estadoCarrera, idUsuario, dto.idInscripcion],
      );

      // 3. Auditoría, misma transacción (mismo `manager`)
      await this.auditoriaService.registrar({
        manager,
        idUsuario,
        tabla: 'inscripciones',
        idRegistroAfectado: dto.idInscripcion,
        tipoOperacion: 'modificar',
        valoresAnteriores,
        valoresNuevos: {
          tiempo_oficial: dto.tiempoOficial,
          estado_carrera: dto.estadoCarrera,
        },
        direccionIp,
        userAgent,
        origenModificacion: 'usuario',
      });
    });
  }
}
