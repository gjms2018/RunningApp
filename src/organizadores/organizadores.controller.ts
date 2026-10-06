import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ScopePermissionGuard } from '../auth/guards/scope-permission.guard';
import { RequiereRol } from '../auth/decorators/requiere-rol.decorator';
import { OrganizadoresService } from './organizadores.service';

class CrearOrganizadorBodyDto {
  nombreEmpresa: string;
  identificacionFiscal?: string;
  telefono?: string;
  cuentaBancariaPago?: string;
}

class AgregarCoDuenoBodyDto {
  emailNuevoDueno: string;
}

@Controller('organizadores')
export class OrganizadoresController {
  constructor(private organizadoresService: OrganizadoresService) {}

  /**
   * Autoservicio, sin @RequiereRol: cualquier Corredor autenticado
   * puede crear un Organizador — mismo criterio que crear un Equipo.
   * Un usuario puede terminar siendo dueño de varios (ver decisión
   * tomada sobre el modelo de permisos).
   */
  @Post()
  async crear(@Body() body: CrearOrganizadorBodyDto) {
    const resultado = await this.organizadoresService.crear(body);
    return {
      mensaje: 'Organizador creado. Ya puedes publicar carreras bajo esta organización.',
      ...resultado,
    };
  }

  /**
   * Aquí SÍ aplica el guard de alcance: solo un dueño EXISTENTE de
   * ESTE organizador específico puede agregar a otro. Mismo patrón
   * 'directo' ya usado en el resto del módulo de organizadores.
   */
  @UseGuards(ScopePermissionGuard)
  @RequiereRol('organizador', {
    paramRecurso: 'idOrganizador',
    resolucion: 'directo',
  })
  @Post(':idOrganizador/co-duenos')
  async agregarCoDueno(
    @Param('idOrganizador') idOrganizador: string,
    @Body() body: AgregarCoDuenoBodyDto,
  ) {
    await this.organizadoresService.agregarCoDueno({
      idOrganizador,
      emailNuevoDueno: body.emailNuevoDueno,
    });

    return { mensaje: 'Co-dueño agregado correctamente' };
  }
}
