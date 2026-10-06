import { BadRequestException, Injectable } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

export interface FilaCruda {
  numeroFila: number; // 1-based, útil para que el organizador ubique errores en su archivo original
  identificador: string; // valor tal cual vino en la columna de identificación
  tiempoOficial: string;
  estadoCarrera: string;
}

/**
 * Columnas esperadas en el archivo (encabezados exactos, sin distinguir
 * mayúsculas/minúsculas): identificador, tiempo_oficial, estado_carrera.
 *
 * `identificador` acepta DNI/pasaporte o correo — se resuelve contra
 * `usuarios` en la capa de validación (ResultadosMasivosService), no aquí.
 * Este servicio SOLO parsea texto a filas, no toca la base de datos.
 */
@Injectable()
export class ParseadorResultadosService {
  parsear(buffer: Buffer, nombreArchivo: string): FilaCruda[] {
    const esExcel = /\.xlsx?$/i.test(nombreArchivo);
    return esExcel ? this.parsearExcel(buffer) : this.parsearCsv(buffer);
  }

  private parsearCsv(buffer: Buffer): FilaCruda[] {
    let registros: Record<string, string>[];
    try {
      registros = parseCsv(buffer, {
        columns: (encabezados: string[]) =>
          encabezados.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
      });
    } catch (error) {
      throw new BadRequestException(
        `No se pudo leer el archivo CSV: ${(error as Error).message}`,
      );
    }

    return this.normalizar(registros);
  }

  private parsearExcel(buffer: Buffer): FilaCruda[] {
    const libro = XLSX.read(buffer, { type: 'buffer' });
    const primeraHoja = libro.Sheets[libro.SheetNames[0]];

    if (!primeraHoja) {
      throw new BadRequestException('El archivo Excel no contiene hojas');
    }

    const registros: Record<string, string>[] = XLSX.utils.sheet_to_json(
      primeraHoja,
      { raw: false, defval: '' },
    );

    // Normaliza encabezados a minúsculas (SheetJS respeta el texto
    // original de la primera fila tal cual está en el archivo).
    const registrosNormalizados = registros.map((fila) => {
      const filaMin: Record<string, string> = {};
      for (const [clave, valor] of Object.entries(fila)) {
        filaMin[clave.trim().toLowerCase()] = String(valor).trim();
      }
      return filaMin;
    });

    return this.normalizar(registrosNormalizados);
  }

  private normalizar(registros: Record<string, string>[]): FilaCruda[] {
    const columnasRequeridas = ['identificador', 'tiempo_oficial', 'estado_carrera'];

    if (registros.length === 0) {
      throw new BadRequestException('El archivo no contiene filas de datos');
    }

    const columnasPresentes = Object.keys(registros[0]);
    const faltantes = columnasRequeridas.filter(
      (c) => !columnasPresentes.includes(c),
    );

    if (faltantes.length > 0) {
      throw new BadRequestException(
        `Faltan columnas requeridas en el archivo: ${faltantes.join(', ')}`,
      );
    }

    return registros.map((fila, indice) => ({
      numeroFila: indice + 2, // +2: fila 1 es el encabezado, y es 1-based
      identificador: fila.identificador ?? '',
      tiempoOficial: fila.tiempo_oficial ?? '',
      estadoCarrera: fila.estado_carrera ?? '',
    }));
  }
}
