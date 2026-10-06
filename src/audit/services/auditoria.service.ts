import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TablaAuditada } from '../decorators/auditar.decorator';

export interface RegistrarAuditoriaParams {
  manager: EntityManager; // el EntityManager de la transacción EN CURSO
  idUsuario: string | null; // null si origen_modificacion = 'sistema_automatico'
  tabla: TablaAuditada;
  idRegistroAfectado: string;
  tipoOperacion: 'crear' | 'modificar' | 'eliminar';
  valoresAnteriores: Record<string, unknown> | null;
  valoresNuevos: Record<string, unknown> | null;
  direccionIp: string;
  userAgent?: string;
  origenModificacion?: 'usuario' | 'sistema_automatico';
}

/**
 * Escribe SIEMPRE dentro de la misma transacción que el cambio de negocio
 * (ver AuditInterceptor y CierreCarreraService) — así se garantiza que
 * nunca exista un cambio sin su fila de auditoría correspondiente:
 * si la escritura de auditoría falla, el rollback deshace también el
 * cambio original.
 */
@Injectable()
export class AuditoriaService {
  async registrar(params: RegistrarAuditoriaParams): Promise<void> {
    await params.manager.query(
      `INSERT INTO logs_auditoria
        (id_usuario, tabla_afectada, id_registro_afectado, tipo_operacion,
         valores_anteriores, valores_nuevos, direccion_ip, user_agent, origen_modificacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.idUsuario,
        params.tabla,
        params.idRegistroAfectado,
        params.tipoOperacion,
        params.valoresAnteriores ? JSON.stringify(params.valoresAnteriores) : null,
        params.valoresNuevos ? JSON.stringify(params.valoresNuevos) : null,
        params.direccionIp,
        params.userAgent ?? null,
        params.origenModificacion ?? 'usuario',
      ],
    );
  }
}
