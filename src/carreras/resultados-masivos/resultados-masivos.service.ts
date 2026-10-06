import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ParseadorResultadosService } from './parseador-resultados.service';
import {
  ResumenValidacion,
  ValidadorFilasResultadoService,
} from './validador-filas-resultado.service';
import { AuditoriaService } from '../../audit/services/auditoria.service';
import { RequestContextService } from '../../audit/services/request-context.service';

export interface ResumenConfirmacion extends ResumenValidacion {
  aplicadas: number;
}

/**
 * Dos métodos que comparten TODA la lógica de parseo y validación
 * (mismo ParseadorResultadosService, mismo ValidadorFilasResultadoService)
 * y solo difieren en el paso final: previsualizar() nunca toca la base
 * de datos; confirmar() aplica en una transacción únicamente las filas
 * que salieron 'valida' — las filas con error simplemente se omiten y
 * se reportan, no bloquean la carga del resto del archivo.
 */
@Injectable()
export class ResultadosMasivosService {
  constructor(
    private dataSource: DataSource,
    private parseador: ParseadorResultadosService,
    private validador: ValidadorFilasResultadoService,
    private auditoriaService: AuditoriaService,
    private requestContext: RequestContextService,
  ) {}

  async previsualizar(
    idCarrera: string,
    buffer: Buffer,
    nombreArchivo: string,
  ): Promise<ResumenValidacion> {
    const filasCrudas = this.parseador.parsear(buffer, nombreArchivo);
    // Se usa el manager base (sin transacción ni bloqueo): es una
    // lectura, no debe retener locks sobre inscripciones mientras el
    // organizador revisa el resultado en pantalla.
    return this.validador.validar(this.dataSource.manager, idCarrera, filasCrudas);
  }

  async confirmar(
    idCarrera: string,
    buffer: Buffer,
    nombreArchivo: string,
  ): Promise<ResumenConfirmacion> {
    const { idUsuario, direccionIp, userAgent } = this.requestContext.get();
    const filasCrudas = this.parseador.parsear(buffer, nombreArchivo);

    return this.dataSource.transaction(async (manager) => {
      // Se vuelve a validar DENTRO de la transacción, no se reutiliza el
      // resultado de un preview anterior: entre que el organizador vio
      // la previsualización y confirmó, alguien pudo cancelar su
      // inscripción o cambiar de estado — se necesita el estado más
      // fresco posible antes de escribir.
      const resumen = await this.validador.validar(manager, idCarrera, filasCrudas);

      let aplicadas = 0;

      for (const fila of resumen.filas) {
        if (fila.estado !== 'valida') {
          continue; // se omite, ya queda reportada en el resumen
        }

        const filaAnterior = await manager.query(
          `SELECT estado_carrera, tiempo_oficial FROM inscripciones
           WHERE id_inscripcion = $1 FOR UPDATE`,
          [fila.idInscripcion],
        );

        await manager.query(
          `UPDATE inscripciones
           SET tiempo_oficial = $1,
               estado_carrera = $2,
               resultado_cargado_por_id_usuario = $3
           WHERE id_inscripcion = $4`,
          [fila.tiempoOficial, fila.estadoCarrera, idUsuario, fila.idInscripcion],
        );

        await this.auditoriaService.registrar({
          manager,
          idUsuario,
          tabla: 'inscripciones',
          idRegistroAfectado: fila.idInscripcion!,
          tipoOperacion: 'modificar',
          valoresAnteriores: filaAnterior[0],
          valoresNuevos: {
            tiempo_oficial: fila.tiempoOficial,
            estado_carrera: fila.estadoCarrera,
            origen: `carga_masiva:${nombreArchivo}:fila_${fila.numeroFila}`,
          },
          direccionIp,
          userAgent,
          origenModificacion: 'usuario', // lo disparó una persona, aunque sea en lote
        });

        aplicadas++;
      }

      return { ...resumen, aplicadas };
    });
  }
}
