import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { AuditoriaService } from '../audit/services/auditoria.service';
import { RequestContextService } from '../audit/services/request-context.service';

interface FinalizarCarreraDto {
  idCarrera: string;
}

/**
 * Cierra el ciclo de vida de una carrera y dispara, en la misma
 * transacción, la generación de sus liquidaciones — tal como se definió
 * en la conceptualización: "al cerrar una carrera, el sistema genera
 * automáticamente un estado de cuenta", una por carrera, sin acumular
 * entre eventos distintos.
 *
 * Precondición de negocio: no se puede finalizar una carrera si todavía
 * hay inscripciones en estado 'inscrito' (sin resultado cargado) — el
 * organizador debe terminar de cargar resultados primero.
 */
@Injectable()
export class CierreCarreraService {
  constructor(
    private dataSource: DataSource,
    private auditoriaService: AuditoriaService,
    private requestContext: RequestContextService,
  ) {}

  async finalizar(dto: FinalizarCarreraDto): Promise<void> {
    const { idUsuario, direccionIp, userAgent } = this.requestContext.get();

    await this.dataSource.transaction(async (manager) => {
      const carrera = await this.bloquearYValidarCarrera(manager, dto.idCarrera);

      await this.verificarTodosLosResultadosCargados(manager, dto.idCarrera);

      // 1. Cerrar el evento (auditoría tipo A: columnas simples, no logs_auditoria,
      // porque `carreras` no es una de las 3 tablas financieras/de resultado).
      await manager.query(
        `UPDATE carreras
         SET estado_evento = 'finalizada',
             modificado_por_id_usuario = $1,
             modificado_desde_ip = $2,
             modificado_en = CURRENT_TIMESTAMP,
             origen_modificacion = 'usuario'
         WHERE id_carrera = $3`,
        [idUsuario, direccionIp, dto.idCarrera],
      );

      // 2. Generar la liquidación del Organizador
      await this.generarLiquidacionOrganizador(
        manager,
        dto.idCarrera,
        carrera.id_organizador,
        { idUsuario, direccionIp, userAgent },
      );

      // 3. Generar una liquidación por cada Patrocinador que financió
      // descuentos en esta carrera (puede haber cero, una o varias)
      await this.generarLiquidacionesPatrocinadores(
        manager,
        dto.idCarrera,
        { idUsuario, direccionIp, userAgent },
      );
    });
  }

  private async bloquearYValidarCarrera(
    manager: EntityManager,
    idCarrera: string,
  ) {
    const filas = await manager.query(
      `SELECT id_carrera, id_organizador, estado_evento
       FROM carreras WHERE id_carrera = $1 FOR UPDATE`,
      [idCarrera],
    );

    if (filas.length === 0) {
      throw new NotFoundException('Carrera no encontrada');
    }

    const carrera = filas[0];

    if (carrera.estado_evento === 'finalizada') {
      // Idempotencia: evita generar liquidaciones duplicadas si alguien
      // vuelve a llamar el endpoint por error o doble clic.
      throw new BadRequestException('Esta carrera ya fue finalizada previamente');
    }

    if (carrera.estado_evento === 'cancelada') {
      throw new BadRequestException('No se puede finalizar una carrera cancelada');
    }

    return carrera;
  }

  private async verificarTodosLosResultadosCargados(
    manager: EntityManager,
    idCarrera: string,
  ): Promise<void> {
    const pendientes = await manager.query(
      `SELECT COUNT(*)::int AS total
       FROM inscripciones
       WHERE id_carrera = $1 AND estado_carrera = 'inscrito'`,
      [idCarrera],
    );

    if (pendientes[0].total > 0) {
      throw new BadRequestException(
        `Hay ${pendientes[0].total} inscripción(es) sin resultado cargado. ` +
          `Carga o marca DNF/DNS a todos los inscritos antes de finalizar la carrera.`,
      );
    }
  }

  /**
   * Monto neto del organizador = costo de lista - la parte del descuento
   * que el ORGANIZADOR decidió cubrir de su bolsillo (no la parte del
   * patrocinador, que se le reembolsa aparte en la liquidación #3).
   * Solo se cuentan inscripciones con pago confirmado.
   */
  private async generarLiquidacionOrganizador(
    manager: EntityManager,
    idCarrera: string,
    idOrganizador: string,
    contexto: { idUsuario: string; direccionIp: string; userAgent?: string },
  ): Promise<void> {
    const resultado = await manager.query(
      `SELECT COALESCE(SUM(
         c.costo_inscripcion - COALESCE(d.monto_cubierto_organizador, 0)
       ), 0) AS monto_neto
       FROM inscripciones i
       JOIN carreras c ON c.id_carrera = i.id_carrera
       LEFT JOIN descuentos_inscripcion d ON d.id_inscripcion = i.id_inscripcion
       WHERE i.id_carrera = $1 AND i.estado_pago = 'pagado'`,
      [idCarrera],
    );

    const montoNeto = resultado[0].monto_neto;

    // No se crea una liquidación de $0 — evita ruido en el panel del
    // organizador si, por ejemplo, la carrera tuvo cero inscripciones pagadas.
    if (Number(montoNeto) <= 0) {
      return;
    }

    const idLiquidacion = randomUUID();

    await manager.query(
      `INSERT INTO liquidaciones
        (id_liquidacion, id_carrera, id_organizador, id_patrocinador, monto, estado)
       VALUES ($1, $2, $3, NULL, $4, 'pendiente')`,
      [idLiquidacion, idCarrera, idOrganizador, montoNeto],
    );

    await this.auditoriaService.registrar({
      manager,
      idUsuario: contexto.idUsuario,
      tabla: 'liquidaciones',
      idRegistroAfectado: idLiquidacion,
      tipoOperacion: 'crear',
      valoresAnteriores: null,
      valoresNuevos: { id_organizador: idOrganizador, monto: montoNeto, estado: 'pendiente' },
      direccionIp: contexto.direccionIp,
      userAgent: contexto.userAgent,
      // El VALOR se calculó automáticamente por el motor, aunque el
      // disparo (finalizar la carrera) lo haya hecho un humano.
      origenModificacion: 'sistema_automatico',
    });
  }

  /**
   * Agrupa los descuentos de esta carrera por patrocinador y genera una
   * liquidación por cada uno — puede haber cero (ninguna carrera
   * patrocinada), una, o varias si distintas inscripciones fueron
   * financiadas por patrocinadores distintos.
   */
  private async generarLiquidacionesPatrocinadores(
    manager: EntityManager,
    idCarrera: string,
    contexto: { idUsuario: string; direccionIp: string; userAgent?: string },
  ): Promise<void> {
    const porPatrocinador = await manager.query(
      `SELECT d.id_patrocinador, SUM(d.monto_cubierto_patrocinador) AS monto_total
       FROM descuentos_inscripcion d
       JOIN inscripciones i ON i.id_inscripcion = d.id_inscripcion
       WHERE i.id_carrera = $1
         AND i.estado_pago = 'pagado'
         AND d.id_patrocinador IS NOT NULL
         AND d.monto_cubierto_patrocinador > 0
       GROUP BY d.id_patrocinador`,
      [idCarrera],
    );

    for (const fila of porPatrocinador) {
      const idLiquidacion = randomUUID();

      await manager.query(
        `INSERT INTO liquidaciones
          (id_liquidacion, id_carrera, id_organizador, id_patrocinador, monto, estado)
         VALUES ($1, $2, NULL, $3, $4, 'pendiente')`,
        [idLiquidacion, idCarrera, fila.id_patrocinador, fila.monto_total],
      );

      await this.auditoriaService.registrar({
        manager,
        idUsuario: contexto.idUsuario,
        tabla: 'liquidaciones',
        idRegistroAfectado: idLiquidacion,
        tipoOperacion: 'crear',
        valoresAnteriores: null,
        valoresNuevos: {
          id_patrocinador: fila.id_patrocinador,
          monto: fila.monto_total,
          estado: 'pendiente',
        },
        direccionIp: contexto.direccionIp,
        userAgent: contexto.userAgent,
        origenModificacion: 'sistema_automatico',
      });
    }
  }
}
