import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ScopePermissionGuard } from '../auth/guards/scope-permission.guard';
import { RequiereRol } from '../auth/decorators/requiere-rol.decorator';
import { CrearCarreraService } from './crear-carrera.service';
import { CrearCarreraDto } from './dto/crear-carrera.dto';

/**
 * Ruta anidada bajo /organizadores/:idOrganizador/carreras (en vez de
 * un simple POST /carreras con id_organizador en el body) para que la
 * jerarquía quede explícita en la URL y el guard de alcance 'directo'
 * pueda validar directo contra :idOrganizador sin resolución indirecta
 * — mismo patrón ya usado en co-duenos de OrganizadoresController.
 */
@Controller('organizadores')
@UseGuards(ScopePermissionGuard)
export class CrearCarreraController {
  constructor(private crearCarreraService: CrearCarreraService) {}

  @RequiereRol('organizador', {
    paramRecurso: 'idOrganizador',
    resolucion: 'directo',
  })
  @Post(':idOrganizador/carreras')
  async crear(
    @Param('idOrganizador') idOrganizador: string,
    @Body() dto: CrearCarreraDto,
  ) {
    const resultado = await this.crearCarreraService.crear(idOrganizador, dto);
    return {
      mensaje: 'Carrera creada y publicada como programada.',
      ...resultado,
    };
  }
}
