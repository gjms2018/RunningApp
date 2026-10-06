import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ScopePermissionGuard } from '../auth/guards/scope-permission.guard';
import { RequiereRol } from '../auth/decorators/requiere-rol.decorator';
import { EstadoCuentaService } from './estado-cuenta.service';
import { EstadoLiquidacion } from './entities/liquidacion.entity';

@Controller()
@UseGuards(ScopePermissionGuard)
export class EstadoCuentaController {
  constructor(private estadoCuentaService: EstadoCuentaService) {}

  /**
   * Panel del Organizador: mezcla SUS liquidaciones propias con las de
   * cualquier Patrocinador que le deba transferir dinero por una de sus
   * carreras — ambas requieren acción de su parte (ver
   * EstadoCuentaService.obtenerParaOrganizador). ?estado= filtra por
   * 'pendiente' | 'transferido' | 'conciliado' si se quiere una vista
   * acotada (ej. solo lo que falta por conciliar).
   */
  @RequiereRol('organizador', {
    paramRecurso: 'idOrganizador',
    resolucion: 'directo',
  })
  @Get('organizadores/:idOrganizador/estado-cuenta')
  async estadoCuentaOrganizador(
    @Param('idOrganizador') idOrganizador: string,
    @Query('estado') estado?: EstadoLiquidacion,
  ) {
    return this.estadoCuentaService.obtenerParaOrganizador(idOrganizador, { estado });
  }

  /**
   * Panel del Patrocinador: solo sus propias liquidaciones — nunca ve
   * las de otro patrocinador ni las propias del organizador ("cada
   * actor ve únicamente su propio estado de cuenta").
   */
  @RequiereRol('patrocinador', {
    paramRecurso: 'idPatrocinador',
    resolucion: 'directo',
  })
  @Get('patrocinadores/:idPatrocinador/estado-cuenta')
  async estadoCuentaPatrocinador(
    @Param('idPatrocinador') idPatrocinador: string,
    @Query('estado') estado?: EstadoLiquidacion,
  ) {
    return this.estadoCuentaService.obtenerParaPatrocinador(idPatrocinador, { estado });
  }
}
