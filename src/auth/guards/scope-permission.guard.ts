import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ALCANCE_KEY,
  ROLES_KEY,
  AlcanceMetadata,
  TipoRol,
} from '../decorators/requiere-rol.decorator';
import { JwtPayload, RequestWithUser } from '../interfaces/jwt-payload.interface';
import { RecursoResolverService } from './recurso-resolver.service';

/**
 * Valida DOS cosas, no una sola:
 *   1. ¿El usuario tiene una asignación del tipo_rol requerido? (chequeo de tipo)
 *   2. ¿Esa asignación coincide con el DUEÑO real del recurso solicitado? (chequeo de alcance)
 *
 * El error más común en sistemas de roles es validar solo (1) — eso permitiría
 * que un Organizador cargue resultados de la carrera de OTRO Organizador,
 * solo porque ambos comparten el mismo tipo_rol.
 */
@Injectable()
export class ScopePermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private recursoResolver: RecursoResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const tipoRolRequerido = this.reflector.get<TipoRol>(
      ROLES_KEY,
      context.getHandler(),
    );
    const alcanceMeta = this.reflector.get<AlcanceMetadata>(
      ALCANCE_KEY,
      context.getHandler(),
    );

    // Endpoint sin decorador @RequiereRol -> no requiere chequeo de alcance
    // (ej. rutas accesibles a cualquier Corredor autenticado)
    if (!tipoRolRequerido || !alcanceMeta) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const usuario = request.user;

    if (!usuario) {
      throw new ForbiddenException('No autenticado');
    }

    // 1. Chequeo de tipo: ¿tiene ALGUNA asignación de este tipo_rol?
    const idsAlcanceUsuario = this.obtenerIdsPorTipoRol(usuario, tipoRolRequerido);
    if (idsAlcanceUsuario.length === 0) {
      throw new ForbiddenException(
        `Requiere rol '${tipoRolRequerido}' para esta acción`,
      );
    }

    // 2. Chequeo de alcance: ¿el recurso solicitado pertenece a UNA de esas asignaciones?
    const idRecurso = request.params[alcanceMeta.paramRecurso];
    const idDuenoReal = await this.resolverDuenoDelRecurso(
      idRecurso,
      alcanceMeta,
      tipoRolRequerido,
    );

    if (!idDuenoReal || !idsAlcanceUsuario.includes(idDuenoReal)) {
      throw new ForbiddenException(
        'No tienes permisos sobre este recurso específico',
      );
    }

    return true;
  }

  private obtenerIdsPorTipoRol(usuario: JwtPayload, tipoRol: TipoRol): string[] {
    switch (tipoRol) {
      case 'representante_equipo':
        return usuario.equiposRepresentados;
      case 'organizador':
        return usuario.organizadores;
      case 'patrocinador':
        return usuario.patrocinadores;
    }
  }

  private async resolverDuenoDelRecurso(
    idRecurso: string,
    alcanceMeta: AlcanceMetadata,
    tipoRol: TipoRol,
  ): Promise<string | null> {
    switch (alcanceMeta.resolucion) {
      case 'directo':
        // La ruta ya expone directamente el id del alcance
        // (ej. /organizadores/:idOrganizador/...)
        return idRecurso;

      case 'via_carrera':
        // La ruta expone un id_carrera; hay que resolver su id_organizador real
        // (ej. /carreras/:idCarrera/resultados -> carreras.id_organizador)
        return this.recursoResolver.obtenerOrganizadorDeCarrera(idRecurso);

      case 'via_equipo':
        // La ruta expone un id de recurso ligado a un equipo
        // (ej. /equipos/:idEquipo/miembros/:idMiembro/verificar)
        return this.recursoResolver.obtenerEquipoDeRecurso(idRecurso);

      case 'via_liquidacion_patrocinador':
        // Autoriza el paso "marcar transferido": solo el patrocinador
        // dueño de ESA liquidación específica puede marcarla.
        return this.recursoResolver.obtenerPatrocinadorDeLiquidacion(idRecurso);

      case 'via_liquidacion_organizador':
        // Autoriza el paso "marcar conciliado": solo el organizador
        // receptor de ESA liquidación específica puede confirmarla.
        return this.recursoResolver.obtenerOrganizadorDeLiquidacion(idRecurso);

      default:
        return null;
    }
  }
}
