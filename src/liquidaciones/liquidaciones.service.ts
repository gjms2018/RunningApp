import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditoriaService } from '../audit/services/auditoria.service';
import { RequestContextService } from '../audit/services/request-context.service';

interface MarcarTransferidoDto {
  idLiquidacion: string;
  referenciaTransferencia?: string;
}

interface MarcarConciliadoDto {
  idLiquidacion: string;
}

/**
 * Máquina de estados de una liquidación:
 *
 *   pendiente ──(marcarTransferido)──► transferido ──(marcarConciliado)──► conciliado
 *
 * Con una excepción: las liquidaciones de tipo 'organizador' (el neto
 * que recibe el propio organizador, sin contraparte que transfiera
 * dentro del sistema) pueden saltar directo de 'pendiente' a
 * 'conciliado' — el organizador concilia su propio registro contra
 * su contabilidad externa, sin un paso intermedio de "transferido".
 */
@Injectable()
export class LiquidacionesService {
  constructor(
    private dataSource: DataSource,
    private auditoriaService: AuditoriaService,
    private requestContext: RequestContextService,
  ) {}

  /**
   * Solo aplica a liquidaciones de patrocinador. El guard del controller
   * ya validó que quien llama es el id_patrocinador dueño de esta
   * liquidación (ver 'via_liquidacion_patrocinador').
   */
  async marcarTransferido(dto: MarcarTransferidoDto): Promise<void> {
    const { idUsuario, direccionIp, userAgent } = this.requestContext.get();

    await this.dataSource.transaction(async (manager) => {
      const filas = await manager.query(
        `SELECT id_liquidacion, id_organizador, id_patrocinador, estado
         FROM liquidaciones WHERE id_liquidacion = $1 FOR UPDATE`,
        [dto.idLiquidacion],
      );

      if (filas.length === 0) {
        throw new NotFoundException('Liquidación no encontrada');
      }

      const liquidacion = filas[0];

      if (liquidacion.id_patrocinador === null) {
        throw new BadRequestException(
          'Las liquidaciones de organizador no pasan por el paso "transferido"; usa marcarConciliado directamente.',
        );
      }

      if (liquidacion.estado !== 'pendiente') {
        throw new BadRequestException(
          `No se puede marcar como transferido: la liquidación ya está en estado '${liquidacion.estado}'`,
        );
      }

      await manager.query(
        `UPDATE liquidaciones
         SET estado = 'transferido',
             referencia_transferencia = $1
         WHERE id_liquidacion = $2`,
        [dto.referenciaTransferencia ?? null, dto.idLiquidacion],
      );

      await this.auditoriaService.registrar({
        manager,
        idUsuario,
        tabla: 'liquidaciones',
        idRegistroAfectado: dto.idLiquidacion,
        tipoOperacion: 'modificar',
        valoresAnteriores: { estado: liquidacion.estado },
        valoresNuevos: {
          estado: 'transferido',
          referencia_transferencia: dto.referenciaTransferencia,
        },
        direccionIp,
        userAgent,
        origenModificacion: 'usuario',
      });
    });
  }

  /**
   * Quien recibe confirma — regla definida en la conceptualización.
   * El guard ya validó que quien llama es el id_organizador receptor
   * real de esta liquidación (ver 'via_liquidacion_organizador'),
   * sin importar si es una liquidación propia o de un patrocinador.
   */
  async marcarConciliado(dto: MarcarConciliadoDto): Promise<void> {
    const { idUsuario, direccionIp, userAgent } = this.requestContext.get();

    await this.dataSource.transaction(async (manager) => {
      const filas = await manager.query(
        `SELECT id_liquidacion, id_organizador, id_patrocinador, estado
         FROM liquidaciones WHERE id_liquidacion = $1 FOR UPDATE`,
        [dto.idLiquidacion],
      );

      if (filas.length === 0) {
        throw new NotFoundException('Liquidación no encontrada');
      }

      const liquidacion = filas[0];

      const esLiquidacionPropia = liquidacion.id_organizador !== null;
      const estadoRequerido = esLiquidacionPropia ? 'pendiente' : 'transferido';

      if (liquidacion.estado !== estadoRequerido) {
        throw new BadRequestException(
          esLiquidacionPropia
            ? `Esta liquidación debe estar en 'pendiente' para conciliarse directamente (estado actual: '${liquidacion.estado}')`
            : `Esta liquidación debe estar en 'transferido' antes de conciliarse (estado actual: '${liquidacion.estado}')`,
        );
      }

      await manager.query(
        `UPDATE liquidaciones
         SET estado = 'conciliado',
             marcado_pagado_por_id_usuario = $1,
             fecha_marcado_pagado = CURRENT_TIMESTAMP
         WHERE id_liquidacion = $2`,
        [idUsuario, dto.idLiquidacion],
      );

      await this.auditoriaService.registrar({
        manager,
        idUsuario,
        tabla: 'liquidaciones',
        idRegistroAfectado: dto.idLiquidacion,
        tipoOperacion: 'modificar',
        valoresAnteriores: { estado: liquidacion.estado },
        valoresNuevos: { estado: 'conciliado' },
        direccionIp,
        userAgent,
        origenModificacion: 'usuario',
      });
    });
  }
}
