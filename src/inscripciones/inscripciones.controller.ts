import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ValidacionHistorialService } from './validacion-historial.service';
import { InscripcionesService } from './inscripciones.service';
import { AutoridadCorredorService } from './autoridad-corredor.service';
import { RequestWithUser } from '../auth/interfaces/jwt-payload.interface';

class InscribirseBodyDto {
  idEquipoRepresentado?: string;
  /** Presente solo cuando un Tutor inscribe a uno de sus menores. */
  idUsuarioCorredor?: string;
}

/**
 * No lleva @UseGuards(ScopePermissionGuard) ni @RequiereRol: ambos
 * endpoints son accesibles a cualquier Corredor autenticado, sobre su
 * propia cuenta o sobre un corredor que gestiona como Tutor — no hay
 * alcance de organizador/equipo/patrocinador que validar aquí. El
 * JwtAuthGuard global (ver AppModule) ya exige un token válido. La
 * autoridad de tutor se valida dentro de InscripcionesService (para la
 * escritura) y AutoridadCorredorService (para la lectura), sobre
 * `corredoresGestionados` del propio JWT — no solo en este controller.
 */
@Controller('carreras')
export class InscripcionesController {
  constructor(
    private dataSource: DataSource,
    private validacionHistorial: ValidacionHistorialService,
    private inscripcionesService: InscripcionesService,
    private autoridadCorredor: AutoridadCorredorService,
  ) {}

  /**
   * Lectura pura, SIN transacción ni bloqueo — es la consulta que
   * alimenta el botón "Inscribirme" vs "Bloqueado: requiere 5K previos"
   * en el catálogo de carreras (Pantalla 2 del diseño de UX). No reserva
   * cupo ni compromete nada; el corredor (o su Tutor, consultando en su
   * nombre) puede llamarla tantas veces como quiera sin efectos
   * secundarios.
   *
   * ?idUsuarioCorredor=<uuid> permite a un Tutor consultar la
   * elegibilidad de uno de sus menores en vez de la propia.
   */
  @Get(':idCarrera/elegibilidad')
  async consultarElegibilidad(
    @Param('idCarrera') idCarrera: string,
    @Query('idUsuarioCorredor') idUsuarioCorredor: string | undefined,
    @Req() request: RequestWithUser,
  ) {
    const idUsuarioObjetivo = this.autoridadCorredor.resolver(
      idUsuarioCorredor,
      request.user,
    );

    return this.validacionHistorial.evaluar(
      this.dataSource.manager,
      idUsuarioObjetivo,
      idCarrera,
    );
  }

  /**
   * Inscripción real. Vuelve a evaluar la elegibilidad de forma
   * autoritativa dentro de una transacción (ver InscripcionesService),
   * en vez de confiar en el resultado del GET anterior — el historial
   * o los cupos pudieron cambiar entre una llamada y otra.
   *
   * Si el body trae `idUsuarioCorredor`, la inscripción se crea a
   * nombre de ESE corredor (típicamente un menor), con el Tutor como
   * actor autenticado — el Tutor nunca necesita que el menor inicie
   * sesión para gestionar su inscripción.
   */
  @Post(':idCarrera/inscripciones')
  async inscribirse(
    @Param('idCarrera') idCarrera: string,
    @Body() body: InscribirseBodyDto,
  ) {
    const resultado = await this.inscripcionesService.inscribirse({
      idCarrera,
      idEquipoRepresentado: body.idEquipoRepresentado,
      idUsuarioCorredor: body.idUsuarioCorredor,
    });

    return {
      mensaje: 'Inscripción creada. Pendiente de pago.',
      ...resultado,
    };
  }
}
