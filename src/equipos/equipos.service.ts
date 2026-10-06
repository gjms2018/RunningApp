import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID, randomInt } from 'crypto';
import { RequestContextService } from '../audit/services/request-context.service';

interface CrearEquipoDto {
  nombreEquipo: string;
  logoUrl?: string;
}

interface UnirseEquipoDto {
  codigoInvitacion: string;
}

// Se excluyen caracteres ambiguos (0/O, 1/I/L) para que el código sea
// fácil de transcribir a mano o leer en voz alta al compartirlo.
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LONGITUD_CODIGO = 8;

@Injectable()
export class EquiposService {
  constructor(
    private dataSource: DataSource,
    private requestContext: RequestContextService,
  ) {}

  /**
   * Quien crea el equipo queda automáticamente como Representante
   * (asignaciones_rol) Y como miembro fundador verificado — se confía
   * por defecto en quien funda el equipo, sin pasar por el flujo de
   * verificación manual que sí aplica a quienes se unen después. Si
   * prefieres que incluso el fundador pase por autoverificación
   * explícita, basta con cambiar `verificado: true` a `false` aquí.
   */
  async crear(dto: CrearEquipoDto): Promise<{ idEquipo: string; codigoInvitacion: string }> {
    const { idUsuario, direccionIp } = this.requestContext.get();

    return this.dataSource.transaction(async (manager) => {
      const idEquipo = randomUUID();
      const codigoInvitacion = await this.generarCodigoUnico(manager);

      await manager.query(
        `INSERT INTO equipos
          (id_equipo, nombre_equipo, codigo_invitacion, logo_url,
           creado_por_id_usuario, creado_desde_ip, origen_modificacion)
         VALUES ($1, $2, $3, $4, $5, $6, 'usuario')`,
        [idEquipo, dto.nombreEquipo, codigoInvitacion, dto.logoUrl ?? null, idUsuario, direccionIp],
      );

      // Asignación de rol con alcance — ver tabla asignaciones_rol
      await manager.query(
        `INSERT INTO asignaciones_rol (id_asignacion, id_usuario, tipo_rol, id_equipo)
         VALUES ($1, $2, 'representante_equipo', $3)`,
        [randomUUID(), idUsuario, idEquipo],
      );

      // Membresía del fundador, verificada por defecto (ver nota arriba)
      await manager.query(
        `INSERT INTO miembros_equipo
          (id_usuario, id_equipo, es_principal, verificado,
           verificado_por_id_usuario, fecha_verificacion,
           modificado_por_id_usuario, modificado_desde_ip, modificado_en, origen_modificacion)
         VALUES ($1, $2, TRUE, TRUE, $1, CURRENT_TIMESTAMP, $1, $3, CURRENT_TIMESTAMP, 'usuario')`,
        [idUsuario, idEquipo, direccionIp],
      );

      return { idEquipo, codigoInvitacion };
    });
  }

  /**
   * El corredor se une SIN verificar (verificado = false por default de
   * la columna) — necesita que el Representante otorgue el check
   * después, tal como se definió en el flujo de verificación de
   * identidad. `es_principal` solo se marca TRUE si es el primer equipo
   * del corredor; si ya tiene otro marcado como principal, se une como
   * secundario y puede cambiar cuál es su equipo principal más adelante.
   */
  async unirse(dto: UnirseEquipoDto): Promise<{ idEquipo: string; nombreEquipo: string }> {
    const { idUsuario, direccionIp } = this.requestContext.get();

    return this.dataSource.transaction(async (manager) => {
      const equipoFilas = await manager.query(
        `SELECT id_equipo, nombre_equipo FROM equipos WHERE codigo_invitacion = $1`,
        [dto.codigoInvitacion.trim().toUpperCase()],
      );

      if (equipoFilas.length === 0) {
        throw new NotFoundException('Código de invitación inválido');
      }

      const equipo = equipoFilas[0];

      const yaMiembro = await manager.query(
        `SELECT 1 FROM miembros_equipo WHERE id_usuario = $1 AND id_equipo = $2`,
        [idUsuario, equipo.id_equipo],
      );

      if (yaMiembro.length > 0) {
        throw new ConflictException('Ya perteneces a este equipo');
      }

      const tieneEquipoPrincipal = await manager.query(
        `SELECT 1 FROM miembros_equipo WHERE id_usuario = $1 AND es_principal = TRUE`,
        [idUsuario],
      );

      const seraPrincipal = tieneEquipoPrincipal.length === 0;

      await manager.query(
        `INSERT INTO miembros_equipo
          (id_usuario, id_equipo, es_principal, verificado,
           modificado_por_id_usuario, modificado_desde_ip, modificado_en, origen_modificacion)
         VALUES ($1, $2, $3, FALSE, $1, $4, CURRENT_TIMESTAMP, 'usuario')`,
        [idUsuario, equipo.id_equipo, seraPrincipal, direccionIp],
      );

      return { idEquipo: equipo.id_equipo, nombreEquipo: equipo.nombre_equipo };
    });
  }

  /**
   * Solo el Representante puede regenerar el código (invalida el
   * anterior) — útil si el código se filtró más allá de a quienes se
   * quería invitar. El guard del controller ya valida ese alcance.
   */
  async regenerarCodigo(idEquipo: string): Promise<{ codigoInvitacion: string }> {
    const { idUsuario, direccionIp } = this.requestContext.get();

    return this.dataSource.transaction(async (manager) => {
      const nuevoCodigo = await this.generarCodigoUnico(manager);

      const resultado = await manager.query(
        `UPDATE equipos
         SET codigo_invitacion = $1,
             modificado_por_id_usuario = $2,
             modificado_desde_ip = $3,
             modificado_en = CURRENT_TIMESTAMP,
             origen_modificacion = 'usuario'
         WHERE id_equipo = $4
         RETURNING id_equipo`,
        [nuevoCodigo, idUsuario, direccionIp, idEquipo],
      );

      if (resultado.length === 0) {
        throw new NotFoundException('Equipo no encontrado');
      }

      return { codigoInvitacion: nuevoCodigo };
    });
  }

  /**
   * Genera un código aleatorio y reintenta si colisiona con uno
   * existente (extremadamente improbable con 8 caracteres sobre un
   * alfabeto de 32 símbolos, pero el UNIQUE de la base es la garantía
   * real — este bucle solo evita que ese caso, si ocurriera, tumbe la
   * petición con un error crudo de constraint).
   */
  private async generarCodigoUnico(manager: DataSource['manager']): Promise<string> {
    const MAX_INTENTOS = 5;

    for (let intento = 0; intento < MAX_INTENTOS; intento++) {
      const codigo = this.generarCodigoAleatorio();
      const existe = await manager.query(
        `SELECT 1 FROM equipos WHERE codigo_invitacion = $1`,
        [codigo],
      );
      if (existe.length === 0) {
        return codigo;
      }
    }

    throw new BadRequestException(
      'No se pudo generar un código de invitación único, intenta de nuevo',
    );
  }

  private generarCodigoAleatorio(): string {
    let codigo = '';
    for (let i = 0; i < LONGITUD_CODIGO; i++) {
      codigo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
    }
    return codigo;
  }
}
