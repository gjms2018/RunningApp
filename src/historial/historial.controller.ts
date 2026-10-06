import { Controller, Get, Query, Req } from '@nestjs/common';
import { HistorialService } from './historial.service';
import { AutoridadCorredorService } from '../inscripciones/autoridad-corredor.service';
import { RequestWithUser } from '../auth/interfaces/jwt-payload.interface';

/**
 * Sin @UseGuards(ScopePermissionGuard) ni @RequiereRol — mismo criterio
 * que InscripcionesController: es una consulta sobre uno mismo o sobre
 * un corredor bajo tutela, no sobre un recurso de organizador/equipo/
 * patrocinador. La autorización la resuelve AutoridadCorredorService.
 */
@Controller('historial')
export class HistorialController {
  constructor(
    private historialService: HistorialService,
    private autoridadCorredor: AutoridadCorredorService,
  ) {}

  /**
   * Sin querystring: el propio historial del actor autenticado.
   * ?idUsuarioCorredor=<uuid>: el Tutor consultando el historial de
   * uno de sus corredores gestionados — misma regla de autoridad que
   * ya se usa para la elegibilidad de inscripción.
   */
  @Get()
  async obtenerMiHistorial(
    @Query('idUsuarioCorredor') idUsuarioCorredor: string | undefined,
    @Req() request: RequestWithUser,
  ) {
    const idUsuarioObjetivo = this.autoridadCorredor.resolver(
      idUsuarioCorredor,
      request.user,
    );

    return this.historialService.obtenerCompendio(idUsuarioObjetivo);
  }
}
