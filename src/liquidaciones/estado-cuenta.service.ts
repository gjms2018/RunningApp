import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EstadoLiquidacion } from './entities/liquidacion.entity';

interface FiltrosEstadoCuenta {
  estado?: EstadoLiquidacion;
}

interface FilaLiquidacion {
  idLiquidacion: string;
  idCarrera: string;
  nombreEvento: string;
  fechaEvento: Date;
  monto: string;
  estado: EstadoLiquidacion;
  fechaMarcadoPagado: Date | null;
  referenciaTransferencia: string | null;
  contraparte: string;
  /** Solo presente en la vista del Organizador: distingue su propia
   * liquidación (lo que él recibe por la carrera) de las de un
   * patrocinador (dinero que un tercero le debe transferir a él). */
  tipo?: 'propia' | 'patrocinador';
}

interface ResumenMontos {
  totalPendiente: string;
  totalTransferido: string;
  totalConciliado: string;
}

export interface EstadoCuenta {
  resumen: ResumenMontos;
  liquidaciones: FilaLiquidacion[];
}

/**
 * "Panel de estado de cuenta": a diferencia de ReportesPatrocinadorService
 * (que da una foto AGREGADA de impacto), este servicio expone cada
 * liquidación de forma individual — es la vista operativa que alimenta
 * las acciones de marcarTransferido/marcarConciliado del
 * LiquidacionesController, no solo un reporte de lectura.
 */
@Injectable()
export class EstadoCuentaService {
  constructor(private dataSource: DataSource) {}

  /**
   * El Organizador ve DOS tipos de liquidación mezclados en una sola
   * lista: las suyas propias (id_organizador = X, el neto que le
   * corresponde por la carrera) Y las de cualquier Patrocinador que
   * deba transferirle dinero para esa misma carrera — porque en ambos
   * casos es ÉL quien tiene que hacer algo (conciliar). El campo `tipo`
   * le permite al frontend distinguirlas visualmente.
   */
  async obtenerParaOrganizador(
    idOrganizador: string,
    filtros: FiltrosEstadoCuenta,
  ): Promise<EstadoCuenta> {
    const condicionEstado = filtros.estado ? 'AND l.estado = $2' : '';
    const parametros = filtros.estado ? [idOrganizador, filtros.estado] : [idOrganizador];

    const filas = await this.dataSource.query(
      `SELECT
         l.id_liquidacion,
         l.id_carrera,
         c.nombre_evento,
         c.fecha_evento,
         l.monto,
         l.estado,
         l.fecha_marcado_pagado,
         l.referencia_transferencia,
         CASE WHEN l.id_organizador IS NOT NULL THEN 'propia' ELSE 'patrocinador' END AS tipo,
         COALESCE(p.nombre_marca, 'Ingresos propios de la carrera') AS contraparte
       FROM liquidaciones l
       JOIN carreras c ON c.id_carrera = l.id_carrera
       LEFT JOIN patrocinadores p ON p.id_patrocinador = l.id_patrocinador
       WHERE (l.id_organizador = $1 OR (l.id_patrocinador IS NOT NULL AND c.id_organizador = $1))
         ${condicionEstado}
       ORDER BY c.fecha_evento DESC`,
      parametros,
    );

    return this.mapearResultado(filas);
  }

  /**
   * El Patrocinador solo ve sus propias liquidaciones (id_patrocinador
   * = X) — nunca las de otro patrocinador ni las propias del
   * organizador, coherente con "cada actor ve únicamente su propio
   * estado de cuenta" definido en la conceptualización.
   */
  async obtenerParaPatrocinador(
    idPatrocinador: string,
    filtros: FiltrosEstadoCuenta,
  ): Promise<EstadoCuenta> {
    const condicionEstado = filtros.estado ? 'AND l.estado = $2' : '';
    const parametros = filtros.estado ? [idPatrocinador, filtros.estado] : [idPatrocinador];

    const filas = await this.dataSource.query(
      `SELECT
         l.id_liquidacion,
         l.id_carrera,
         c.nombre_evento,
         c.fecha_evento,
         l.monto,
         l.estado,
         l.fecha_marcado_pagado,
         l.referencia_transferencia,
         o.nombre_empresa AS contraparte
       FROM liquidaciones l
       JOIN carreras c ON c.id_carrera = l.id_carrera
       JOIN organizadores o ON o.id_organizador = c.id_organizador
       WHERE l.id_patrocinador = $1
         ${condicionEstado}
       ORDER BY c.fecha_evento DESC`,
      parametros,
    );

    return this.mapearResultado(filas);
  }

  private mapearResultado(filas: any[]): EstadoCuenta {
    const resumen: ResumenMontos = {
      totalPendiente: '0',
      totalTransferido: '0',
      totalConciliado: '0',
    };

    let sumaPendiente = 0;
    let sumaTransferido = 0;
    let sumaConciliado = 0;

    const liquidaciones: FilaLiquidacion[] = filas.map((fila) => {
      const monto = Number(fila.monto);
      if (fila.estado === 'pendiente') sumaPendiente += monto;
      if (fila.estado === 'transferido') sumaTransferido += monto;
      if (fila.estado === 'conciliado') sumaConciliado += monto;

      return {
        idLiquidacion: fila.id_liquidacion,
        idCarrera: fila.id_carrera,
        nombreEvento: fila.nombre_evento,
        fechaEvento: fila.fecha_evento,
        monto: fila.monto,
        estado: fila.estado,
        fechaMarcadoPagado: fila.fecha_marcado_pagado,
        referenciaTransferencia: fila.referencia_transferencia,
        contraparte: fila.contraparte,
        ...(fila.tipo ? { tipo: fila.tipo } : {}),
      };
    });

    resumen.totalPendiente = sumaPendiente.toFixed(2);
    resumen.totalTransferido = sumaTransferido.toFixed(2);
    resumen.totalConciliado = sumaConciliado.toFixed(2);

    return { resumen, liquidaciones };
  }
}
