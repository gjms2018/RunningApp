import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ScopePermissionGuard } from '../auth/guards/scope-permission.guard';
import { RequiereRol } from '../auth/decorators/requiere-rol.decorator';
import { LiquidacionesService } from './liquidaciones.service';

class MarcarTransferidoBodyDto {
  referenciaTransferencia?: string;
}

/**
 * JwtAuthGuard NO se repite aquí porque está registrado como APP_GUARD
 * global (ver AppModule) — toda ruta ya exige JWT válido por defecto.
 * Solo se agrega ScopePermissionGuard, que es el que lee los decoradores
 * @RequiereRol de cada endpoint.
 */
@Controller('liquidaciones')
@UseGuards(ScopePermissionGuard)
export class LiquidacionesController {
  constructor(private liquidacionesService: LiquidacionesService) {}

  /**
   * Paso 1 del flujo: el PATROCINADOR confirma que ya transfirió su
   * parte. Solo el patrocinador dueño de ESTA liquidación específica
   * puede marcarla — el guard resuelve id_liquidacion -> id_patrocinador
   * real y lo compara contra el alcance del usuario autenticado.
   *
   * Rechaza con 400 si la liquidación es de tipo 'organizador' (esas no
   * pasan por este paso) o si ya no está en estado 'pendiente'.
   */
  @RequiereRol('patrocinador', {
    paramRecurso: 'idLiquidacion',
    resolucion: 'via_liquidacion_patrocinador',
  })
  @Patch(':idLiquidacion/transferido')
  async marcarTransferido(
    @Param('idLiquidacion') idLiquidacion: string,
    @Body() body: MarcarTransferidoBodyDto,
  ) {
    await this.liquidacionesService.marcarTransferido({
      idLiquidacion,
      referenciaTransferencia: body.referenciaTransferencia,
    });

    return { mensaje: 'Liquidación marcada como transferida' };
  }

  /**
   * Paso 2 del flujo: el ORGANIZADOR confirma que recibió el dinero
   * (ya sea de un patrocinador, o concilia su propio registro si la
   * liquidación es la suya). El guard resuelve id_liquidacion -> el
   * id_organizador receptor real, sin importar el tipo de liquidación.
   */
  @RequiereRol('organizador', {
    paramRecurso: 'idLiquidacion',
    resolucion: 'via_liquidacion_organizador',
  })
  @Patch(':idLiquidacion/conciliado')
  async marcarConciliado(@Param('idLiquidacion') idLiquidacion: string) {
    await this.liquidacionesService.marcarConciliado({ idLiquidacion });

    return { mensaje: 'Liquidación conciliada' };
  }
}
