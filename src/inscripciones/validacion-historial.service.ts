import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ConfigService } from '@nestjs/config';

export interface ResultadoElegibilidad {
  elegible: boolean;
  motivo: string;
  distanciaRequeridaKm: number;
}

/**
 * Encapsula la regla de negocio central del sistema: "no puedes correr
 * la distancia X si no tienes un registro validado en la distancia Y".
 *
 * Se diseña como servicio independiente (no como parte de
 * InscripcionesService) para poder reutilizarlo en dos contextos:
 *  1. Un GET de solo lectura que alimenta el botón "Inscribirme" /
 *     "Bloqueado" en el catálogo de carreras, sin crear ninguna fila.
 *  2. La validación real dentro de la transacción de inscripción,
 *     donde si alguien pasó el chequeo del GET pero su situación
 *     cambió mientras tanto, se vuelve a evaluar de forma autoritativa.
 *
 * DESACTIVADO TEMPORALMENTE (fase piloto con RunSquad): se decidió no
 * exigir historial previo por ahora, sin importar lo que el organizador
 * configure en `distancia_requerida_km` de cada carrera. En vez de
 * borrar la lógica (que se necesitará en Fase 2 al abrir la plataforma
 * a otros organizadores), se apaga con una bandera de configuración —
 * VALIDACION_HISTORIAL_ACTIVA=false por defecto. Reactivarla en el
 * futuro es cambiar una variable de entorno, no tocar código.
 */
@Injectable()
export class ValidacionHistorialService {
  constructor(private configService: ConfigService) {}

  /**
   * @param manager Se recibe explícito (en vez de inyectar un Repository)
   * para poder reutilizar este método TANTO fuera de una transacción
   * (el GET de elegibilidad) COMO dentro de una transacción con FOR
   * UPDATE ya abierta (la inscripción real), sin duplicar lógica SQL.
   */
  async evaluar(
    manager: EntityManager,
    idUsuario: string,
    idCarrera: string,
  ): Promise<ResultadoElegibilidad> {
    const carreraFilas = await manager.query(
      `SELECT distancia_requerida_km FROM carreras WHERE id_carrera = $1`,
      [idCarrera],
    );

    if (carreraFilas.length === 0) {
      return {
        elegible: false,
        motivo: 'La carrera no existe',
        distanciaRequeridaKm: 0,
      };
    }

    const distanciaRequeridaKm = Number(carreraFilas[0].distancia_requerida_km);

    // Bandera global de fase piloto: la regla de negocio queda intacta
    // más abajo, pero no se llega a evaluar. `distanciaRequeridaKm` se
    // sigue devolviendo tal cual está configurada en la carrera, para
    // que el frontend pueda mostrarla informativamente si quiere,
    // aunque no se esté aplicando como bloqueo.
    const validacionActiva = this.configService.get<string>(
      'VALIDACION_HISTORIAL_ACTIVA',
      'false',
    ) === 'true';

    if (!validacionActiva) {
      return {
        elegible: true,
        motivo: 'Validación de historial previo desactivada temporalmente (fase piloto)',
        distanciaRequeridaKm,
      };
    }

    // Sin requisito previo (ej. la carrera semilla de 5K) -> siempre elegible
    if (distanciaRequeridaKm <= 0) {
      return { elegible: true, motivo: 'Sin requisito previo', distanciaRequeridaKm };
    }

    // Se acepta CUALQUIER distancia finalizada >= la requerida, no solo
    // una coincidencia exacta: quien ya corrió 10K también califica
    // para un evento que pide 5K. Esto amplía el pseudocódigo original
    // (que comparaba igualdad estricta) de forma deliberada.
    const historial = await manager.query(
      `SELECT 1
       FROM inscripciones i
       JOIN carreras c ON c.id_carrera = i.id_carrera
       WHERE i.id_usuario = $1
         AND i.estado_carrera = 'finalizado'
         AND c.distancia_km >= $2
       LIMIT 1`,
      [idUsuario, distanciaRequeridaKm],
    );

    if (historial.length > 0) {
      return {
        elegible: true,
        motivo: `Historial validado de ${distanciaRequeridaKm}K o más`,
        distanciaRequeridaKm,
      };
    }

    return {
      elegible: false,
      motivo: `Requiere una carrera de ${distanciaRequeridaKm}K finalizada previamente`,
      distanciaRequeridaKm,
    };
  }
}
