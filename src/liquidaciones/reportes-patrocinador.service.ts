import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

interface FiltrosReporteImpacto {
  fechaDesde?: string;
  fechaHasta?: string;
  idCarrera?: string;
}

interface DesgloseCarrera {
  idCarrera: string;
  nombreEvento: string;
  fechaEvento: Date;
  montoFinanciado: string;
  corredoresBeneficiados: number;
}

export interface ReporteImpacto {
  montoTotalFinanciado: string;
  corredoresBeneficiados: number;
  carrerasPatrocinadas: number;
  desglosePorCarrera: DesgloseCarrera[];
  liquidaciones: {
    pendientes: number;
    transferidas: number;
    conciliadas: number;
  };
}

/**
 * Deliberadamente NO expone nombres, correos ni ningún dato personal
 * de los corredores beneficiados — solo agregados (montos y conteos).
 * El patrocinador tiene derecho a ver el IMPACTO de su inversión, no
 * la identidad de corredores individuales; exponerla sería una fuga de
 * privacidad innecesaria para el objetivo real de este reporte.
 */
@Injectable()
export class ReportesPatrocinadorService {
  constructor(private dataSource: DataSource) {}

  async obtenerImpacto(
    idPatrocinador: string,
    filtros: FiltrosReporteImpacto,
  ): Promise<ReporteImpacto> {
    const condiciones: string[] = [
      'd.id_patrocinador = $1',
      "i.estado_pago = 'pagado'",
      'd.monto_cubierto_patrocinador > 0',
    ];
    const parametros: unknown[] = [idPatrocinador];

    if (filtros.fechaDesde) {
      parametros.push(filtros.fechaDesde);
      condiciones.push(`c.fecha_evento >= $${parametros.length}`);
    }
    if (filtros.fechaHasta) {
      parametros.push(filtros.fechaHasta);
      condiciones.push(`c.fecha_evento <= $${parametros.length}`);
    }
    if (filtros.idCarrera) {
      parametros.push(filtros.idCarrera);
      condiciones.push(`c.id_carrera = $${parametros.length}`);
    }

    const whereClause = condiciones.join(' AND ');

    // Totales generales
    const totalesFilas = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(d.monto_cubierto_patrocinador), 0) AS monto_total,
         COUNT(DISTINCT i.id_usuario) AS corredores,
         COUNT(DISTINCT i.id_carrera) AS carreras
       FROM descuentos_inscripcion d
       JOIN inscripciones i ON i.id_inscripcion = d.id_inscripcion
       JOIN carreras c ON c.id_carrera = i.id_carrera
       WHERE ${whereClause}`,
      parametros,
    );

    // Desglose por carrera — mismo WHERE, agrupado
    const desgloseFilas = await this.dataSource.query(
      `SELECT
         c.id_carrera,
         c.nombre_evento,
         c.fecha_evento,
         SUM(d.monto_cubierto_patrocinador) AS monto_financiado,
         COUNT(DISTINCT i.id_usuario) AS corredores_beneficiados
       FROM descuentos_inscripcion d
       JOIN inscripciones i ON i.id_inscripcion = d.id_inscripcion
       JOIN carreras c ON c.id_carrera = i.id_carrera
       WHERE ${whereClause}
       GROUP BY c.id_carrera, c.nombre_evento, c.fecha_evento
       ORDER BY c.fecha_evento DESC`,
      parametros,
    );

    // Estado de las liquidaciones de este patrocinador — no se filtra
    // por fecha/carrera aquí a propósito: es un resumen de cuentas
    // pendientes/conciliadas GLOBAL, independiente del período que se
    // esté consultando en el resto del reporte.
    const liquidacionesFilas = await this.dataSource.query(
      `SELECT estado, COUNT(*)::int AS total
       FROM liquidaciones
       WHERE id_patrocinador = $1
       GROUP BY estado`,
      [idPatrocinador],
    );

    const conteoLiquidaciones = { pendientes: 0, transferidas: 0, conciliadas: 0 };
    for (const fila of liquidacionesFilas) {
      if (fila.estado === 'pendiente') conteoLiquidaciones.pendientes = fila.total;
      if (fila.estado === 'transferido') conteoLiquidaciones.transferidas = fila.total;
      if (fila.estado === 'conciliado') conteoLiquidaciones.conciliadas = fila.total;
    }

    return {
      montoTotalFinanciado: totalesFilas[0].monto_total,
      corredoresBeneficiados: Number(totalesFilas[0].corredores),
      carrerasPatrocinadas: Number(totalesFilas[0].carreras),
      desglosePorCarrera: desgloseFilas.map((fila: any) => ({
        idCarrera: fila.id_carrera,
        nombreEvento: fila.nombre_evento,
        fechaEvento: fila.fecha_evento,
        montoFinanciado: fila.monto_financiado,
        corredoresBeneficiados: Number(fila.corredores_beneficiados),
      })),
      liquidaciones: conteoLiquidaciones,
    };
  }
}
