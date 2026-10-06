import { SetMetadata } from '@nestjs/common';

export type TipoRol = 'representante_equipo' | 'organizador' | 'patrocinador';

/**
 * Describe de dónde saca el guard el ID del recurso a comparar contra
 * el alcance del usuario. Ej: si la ruta es /carreras/:idCarrera/resultados,
 * el guard necesita resolver idCarrera -> carreras.id_organizador antes
 * de comparar contra el alcance del usuario (ver ScopePermissionGuard).
 */
export interface AlcanceMetadata {
  /** Nombre del parámetro de ruta que identifica el recurso, ej. 'idCarrera' */
  paramRecurso: string;
  /**
   * Cómo resolver el id_organizador / id_equipo / id_patrocinador dueño
   * del recurso a partir del paramRecurso. Si el paramRecurso YA ES
   * directamente el id del alcance (ej. /organizadores/:idOrganizador/...),
   * usar 'directo'.
   */
  resolucion:
    | 'directo'
    | 'via_carrera'
    | 'via_equipo'
    | 'via_liquidacion_patrocinador'
    | 'via_liquidacion_organizador';
}

export const ROLES_KEY = 'requiereRol';
export const ALCANCE_KEY = 'alcanceMetadata';

/**
 * Ejemplo de uso en un controller:
 *
 *   @RequiereRol('organizador', { paramRecurso: 'idCarrera', resolucion: 'via_carrera' })
 *   @Patch('carreras/:idCarrera/resultados')
 *   cargarResultados(@Param('idCarrera') idCarrera: string, ...) { ... }
 *
 * Esto exige que el usuario tenga una asignación 'organizador' cuyo
 * id_organizador coincida con carreras.id_organizador de :idCarrera —
 * no basta con "ser organizador de alguna carrera".
 */
export const RequiereRol = (tipoRol: TipoRol, alcance: AlcanceMetadata) =>
  function (target: any, key?: string, descriptor?: PropertyDescriptor) {
    SetMetadata(ROLES_KEY, tipoRol)(target, key, descriptor);
    SetMetadata(ALCANCE_KEY, alcance)(target, key, descriptor);
    return descriptor;
  };
