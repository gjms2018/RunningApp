import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ScopePermissionGuard } from '../auth/guards/scope-permission.guard';
import { RequiereRol } from '../auth/decorators/requiere-rol.decorator';
import { ReportesPatrocinadorService } from './reportes-patrocinador.service';

@Controller('patrocinadores')
@UseGuards(ScopePermissionGuard)
export class ReportesPatrocinadorController {
  constructor(private reportesService: ReportesPatrocinadorService) {}

  /**
   * "Financiaste $X en descuentos repartidos entre Y corredores" — el
   * argumento de venta que se definió en la conceptualización. Mismo
   * patrón 'directo' que ya usamos: :idPatrocinador ya viene explícito
   * en la ruta, así que el guard lo compara directo contra el alcance
   * del usuario autenticado, sin resolución indirecta.
   *
   * Filtros opcionales por querystring para que el patrocinador pueda
   * acotar el reporte a un rango de fechas o a una carrera específica,
   * sin necesidad de un endpoint distinto por cada vista.
   */
  @RequiereRol('patrocinador', {
    paramRecurso: 'idPatrocinador',
    resolucion: 'directo',
  })
  @Get(':idPatrocinador/impacto')
  async obtenerImpacto(
    @Param('idPatrocinador') idPatrocinador: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
    @Query('idCarrera') idCarrera?: string,
  ) {
    return this.reportesService.obtenerImpacto(idPatrocinador, {
      fechaDesde,
      fechaHasta,
      idCarrera,
    });
  }
}
