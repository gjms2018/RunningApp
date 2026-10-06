import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

interface CarreraDelHistorial {
  idCarrera: string;
  nombreEvento: string;
  fechaEvento: Date;
  distanciaKm: string;
  tiempoOficial: string | null;
  estadoCarrera: 'inscrito' | 'finalizado' | 'dnf' | 'dns';
  idEquipoRepresentado: string | null;
}

interface ResumenHistorial {
  carrerasFinalizadas: number;
  distanciaTotalKm: string;
  distanciaMaximaFinalizadaKm: string | null;
}

export interface CompendioHistorial {
  resumen: ResumenHistorial;
  carreras: CarreraDelHistorial[];
}

/**
 * "El compendio" — el término que se usó desde la primera conversación
 * de conceptualización para el historial de un corredor. Es de
 * solo lectura y no depende de si `VALIDACION_HISTORIAL_ACTIVA` está
 * encendida o no: el compendio siempre refleja la realidad completa de
 * lo que el corredor ha corrido, aunque el motor de bloqueo esté
 * apagado temporalmente en esta fase piloto.
 */
@Injectable()
export class HistorialService {
  constructor(private dataSource: DataSource) {}

  async obtenerCompendio(idUsuario: string): Promise<CompendioHistorial> {
    const filas = await this.dataSource.query(
      `SELECT
         c.id_carrera,
         c.nombre_evento,
         c.fecha_evento,
         c.distancia_km,
         i.tiempo_oficial,
         i.estado_carrera,
         i.id_equipo_representado
       FROM inscripciones i
       JOIN carreras c ON c.id_carrera = i.id_carrera
       WHERE i.id_usuario = $1
       ORDER BY c.fecha_evento DESC`,
      [idUsuario],
    );

    const carreras: CarreraDelHistorial[] = filas.map((fila: any) => ({
      idCarrera: fila.id_carrera,
      nombreEvento: fila.nombre_evento,
      fechaEvento: fila.fecha_evento,
      distanciaKm: fila.distancia_km,
      tiempoOficial: fila.tiempo_oficial,
      estadoCarrera: fila.estado_carrera,
      idEquipoRepresentado: fila.id_equipo_representado,
    }));

    const finalizadas = carreras.filter((c) => c.estadoCarrera === 'finalizado');

    const distanciaTotal = finalizadas.reduce(
      (acumulado, c) => acumulado + Number(c.distanciaKm),
      0,
    );

    const distanciaMaxima =
      finalizadas.length > 0
        ? Math.max(...finalizadas.map((c) => Number(c.distanciaKm)))
        : null;

    return {
      resumen: {
        carrerasFinalizadas: finalizadas.length,
        distanciaTotalKm: distanciaTotal.toFixed(2),
        distanciaMaximaFinalizadaKm: distanciaMaxima !== null ? distanciaMaxima.toFixed(2) : null,
      },
      carreras,
    };
  }
}
