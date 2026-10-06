import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ScopePermissionGuard } from '../auth/guards/scope-permission.guard';
import { RequiereRol } from '../auth/decorators/requiere-rol.decorator';
import { PatrocinadoresService } from './patrocinadores.service';

class CrearPatrocinadorBodyDto {
  nombreMarca: string;
  identificacionFiscal?: string;
  telefono?: string;
  logoUrl?: string;
  cuentaBancariaReferencia?: string;
}

class AgregarCoDuenoBodyDto {
  emailNuevoDueno: string;
}

@Controller('patrocinadores')
export class PatrocinadoresController {
  constructor(private patrocinadoresService: PatrocinadoresService) {}

  /** Autoservicio, mismo criterio que Organizadores y Equipos. */
  @Post()
  async crear(@Body() body: CrearPatrocinadorBodyDto) {
    const resultado = await this.patrocinadoresService.crear(body);
    return {
      mensaje: 'Patrocinador creado. Ya puedes financiar descuentos y ver tu reporte de impacto.',
      ...resultado,
    };
  }

  @UseGuards(ScopePermissionGuard)
  @RequiereRol('patrocinador', {
    paramRecurso: 'idPatrocinador',
    resolucion: 'directo',
  })
  @Post(':idPatrocinador/co-duenos')
  async agregarCoDueno(
    @Param('idPatrocinador') idPatrocinador: string,
    @Body() body: AgregarCoDuenoBodyDto,
  ) {
    await this.patrocinadoresService.agregarCoDueno({
      idPatrocinador,
      emailNuevoDueno: body.emailNuevoDueno,
    });

    return { mensaje: 'Co-dueño agregado correctamente' };
  }
}
