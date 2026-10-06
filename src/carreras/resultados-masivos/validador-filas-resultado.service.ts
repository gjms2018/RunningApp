import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { FilaCruda } from './parseador-resultados.service';

const REGEX_TIEMPO = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/; // HH:MM:SS
const ESTADOS_VALIDOS = ['finalizado', 'dnf', 'dns'];

export type EstadoFilaValidada = 'valida' | 'error';

export interface FilaValidada {
  numeroFila: number;
  identificador: string;
  tiempoOficial: string | null;
  estadoCarrera: string | null;
  estado: EstadoFilaValidada;
  motivoError?: string;
  // Solo presentes si estado === 'valida' — es lo que necesita el UPDATE real
  idUsuario?: string;
  idInscripcion?: string;
}

export interface ResumenValidacion {
  totalFilas: number;
  validas: number;
  conError: number;
  filas: FilaValidada[];
}

/**
 * Encapsula el emparejamiento (fila del archivo -> inscripción real) y
 * las reglas de formato. Se usa TAL CUAL en preview y en confirmación —
 * es la garantía de que "lo que el organizador vio en la previsualización
 * es exactamente lo que se va a aplicar", sin lógica duplicada que
 * pudiera divergir entre ambos pasos.
 */
@Injectable()
export class ValidadorFilasResultadoService {
  async validar(
    manager: EntityManager,
    idCarrera: string,
    filas: FilaCruda[],
  ): Promise<ResumenValidacion> {
    const filasValidadas: FilaValidada[] = [];

    // Detecta identificadores duplicados DENTRO del propio archivo
    // (ej. el mismo DNI aparece dos veces) — un error común al armar
    // la planilla a mano que, si no se detecta aquí, causaría que la
    // segunda fila sobrescriba silenciosamente a la primera.
    const contadorIdentificadores = new Map<string, number>();
    for (const fila of filas) {
      const clave = fila.identificador.trim().toLowerCase();
      contadorIdentificadores.set(clave, (contadorIdentificadores.get(clave) ?? 0) + 1);
    }

    for (const fila of filas) {
      filasValidadas.push(
        await this.validarFila(manager, idCarrera, fila, contadorIdentificadores),
      );
    }

    return {
      totalFilas: filasValidadas.length,
      validas: filasValidadas.filter((f) => f.estado === 'valida').length,
      conError: filasValidadas.filter((f) => f.estado === 'error').length,
      filas: filasValidadas,
    };
  }

  private async validarFila(
    manager: EntityManager,
    idCarrera: string,
    fila: FilaCruda,
    contadorIdentificadores: Map<string, number>,
  ): Promise<FilaValidada> {
    const base = {
      numeroFila: fila.numeroFila,
      identificador: fila.identificador,
      tiempoOficial: fila.tiempoOficial || null,
      estadoCarrera: fila.estadoCarrera || null,
    };

    if (!fila.identificador) {
      return { ...base, estado: 'error', motivoError: 'Falta el identificador (DNI/pasaporte o correo)' };
    }

    const clave = fila.identificador.trim().toLowerCase();
    if ((contadorIdentificadores.get(clave) ?? 0) > 1) {
      return {
        ...base,
        estado: 'error',
        motivoError: 'Identificador duplicado dentro del mismo archivo',
      };
    }

    const estadoNormalizado = fila.estadoCarrera.trim().toLowerCase();
    if (!ESTADOS_VALIDOS.includes(estadoNormalizado)) {
      return {
        ...base,
        estado: 'error',
        motivoError: `estado_carrera inválido: debe ser uno de ${ESTADOS_VALIDOS.join(', ')}`,
      };
    }

    // DNS/DNF no requieren tiempo oficial; finalizado sí, y con formato válido.
    if (estadoNormalizado === 'finalizado') {
      if (!fila.tiempoOficial) {
        return { ...base, estado: 'error', motivoError: 'Falta tiempo_oficial para un resultado finalizado' };
      }
      if (!REGEX_TIEMPO.test(fila.tiempoOficial.trim())) {
        return {
          ...base,
          estado: 'error',
          motivoError: `Formato de tiempo inválido ('${fila.tiempoOficial}'), se espera HH:MM:SS`,
        };
      }
    }

    // Resolver identificador -> usuario (por DNI/pasaporte o correo)
    const usuarioFilas = await manager.query(
      `SELECT id_usuario FROM usuarios WHERE dni_pasaporte = $1 OR email = $1`,
      [fila.identificador.trim()],
    );

    if (usuarioFilas.length === 0) {
      return {
        ...base,
        estado: 'error',
        motivoError: 'No existe ningún corredor registrado con ese DNI/pasaporte o correo',
      };
    }

    const idUsuario = usuarioFilas[0].id_usuario;

    // Resolver usuario + carrera -> inscripción real
    const inscripcionFilas = await manager.query(
      `SELECT id_inscripcion, estado_carrera FROM inscripciones
       WHERE id_usuario = $1 AND id_carrera = $2`,
      [idUsuario, idCarrera],
    );

    if (inscripcionFilas.length === 0) {
      return {
        ...base,
        estado: 'error',
        motivoError: 'Ese corredor no está inscrito en esta carrera',
      };
    }

    return {
      ...base,
      estado: 'valida',
      idUsuario,
      idInscripcion: inscripcionFilas[0].id_inscripcion,
      estadoCarrera: estadoNormalizado,
      tiempoOficial: estadoNormalizado === 'finalizado' ? fila.tiempoOficial.trim() : null,
    };
  }
}
