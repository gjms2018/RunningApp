import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ScopePermissionGuard } from '../auth/guards/scope-permission.guard';
import { RequiereRol } from '../auth/decorators/requiere-rol.decorator';
import { EquiposService } from './equipos.service';

class CrearEquipoBodyDto {
  nombreEquipo: string;
  logoUrl?: string;
}

class UnirseEquipoBodyDto {
  codigoInvitacion: string;
}

@Controller('equipos')
export class EquiposController {
  constructor(private equiposService: EquiposService) {}

  /**
   * Cualquier Corredor autenticado puede crear un equipo — no requiere
   * @RequiereRol porque, antes de esta llamada, nadie tiene todavía el
   * rol 'representante_equipo' sobre NADA: es precisamente esta acción
   * la que se lo otorga (ver EquiposService.crear). Solo pasa por
   * JwtAuthGuard, que ya aplica de forma global.
   */
  @Post()
  async crear(@Body() body: CrearEquipoBodyDto) {
    const resultado = await this.equiposService.crear({
      nombreEquipo: body.nombreEquipo,
      logoUrl: body.logoUrl,
    });

    return {
      mensaje: 'Equipo creado. Comparte el código de invitación con tus corredores.',
      ...resultado,
    };
  }

  /**
   * También sin @RequiereRol: cualquier Corredor autenticado puede
   * unirse a un equipo existente con un código válido — el código en sí
   * es el mecanismo de autorización, no un rol previo.
   */
  @Post('unirse')
  async unirse(@Body() body: UnirseEquipoBodyDto) {
    const resultado = await this.equiposService.unirse({
      codigoInvitacion: body.codigoInvitacion,
    });

    return {
      mensaje: `Te uniste a ${resultado.nombreEquipo}. Un representante debe verificar tu identidad.`,
      ...resultado,
    };
  }

  /**
   * Aquí SÍ aplica el guard de alcance: solo el Representante de ESTE
   * equipo específico puede invalidar el código vigente y generar uno
   * nuevo — mismo patrón 'directo' que ya usamos en verificación de
   * miembros, porque :idEquipo ya viene explícito en la ruta.
   */
  @UseGuards(ScopePermissionGuard)
  @RequiereRol('representante_equipo', {
    paramRecurso: 'idEquipo',
    resolucion: 'directo',
  })
  @Patch(':idEquipo/regenerar-codigo')
  async regenerarCodigo(@Param('idEquipo') idEquipo: string) {
    const resultado = await this.equiposService.regenerarCodigo(idEquipo);
    return {
      mensaje: 'Código de invitación regenerado. El código anterior ya no es válido.',
      ...resultado,
    };
  }
}
