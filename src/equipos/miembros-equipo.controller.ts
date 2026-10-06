import { Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ScopePermissionGuard } from '../auth/guards/scope-permission.guard';
import { RequiereRol } from '../auth/decorators/requiere-rol.decorator';
import { VerificacionMiembroService } from './verificacion-miembro.service';

/**
 * `resolucion: 'directo'` sobre `idEquipo`: a diferencia del guard de
 * `via_equipo` (pensado para rutas donde solo se conoce el id del
 * miembro, no el del equipo), aquí la URL ya expone :idEquipo de forma
 * explícita — no hace falta ninguna consulta extra para resolver el
 * alcance, el propio parámetro de ruta ES el id a comparar.
 */
@Controller('equipos')
@UseGuards(ScopePermissionGuard)
export class MiembrosEquipoController {
  constructor(private verificacionService: VerificacionMiembroService) {}

  @RequiereRol('representante_equipo', {
    paramRecurso: 'idEquipo',
    resolucion: 'directo',
  })
  @Patch(':idEquipo/miembros/:idUsuarioMiembro/verificar')
  async verificar(
    @Param('idEquipo') idEquipo: string,
    @Param('idUsuarioMiembro') idUsuarioMiembro: string,
  ) {
    await this.verificacionService.verificar({ idEquipo, idUsuarioMiembro });
    return { mensaje: 'Miembro verificado correctamente' };
  }

  @RequiereRol('representante_equipo', {
    paramRecurso: 'idEquipo',
    resolucion: 'directo',
  })
  @Patch(':idEquipo/miembros/:idUsuarioMiembro/revocar-verificacion')
  async revocar(
    @Param('idEquipo') idEquipo: string,
    @Param('idUsuarioMiembro') idUsuarioMiembro: string,
  ) {
    await this.verificacionService.revocar({ idEquipo, idUsuarioMiembro });
    return { mensaje: 'Verificación revocada' };
  }
}
