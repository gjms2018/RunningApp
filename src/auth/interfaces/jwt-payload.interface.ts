/**
 * Payload del JWT. En lugar de un campo `rol` plano, se llevan listas de
 * IDs por tipo de alcance — reflejo directo de la tabla `asignaciones_rol`.
 * "Corredor" no aparece aquí: es la condición implícita de cualquier
 * usuario autenticado.
 */
import { Request } from 'express';
export interface JwtPayload {
  idUsuario: string;
  email: string;

  // Alcance: en qué equipos es representante (puede ser más de uno)
  equiposRepresentados: string[];

  // Alcance: en qué equipos es miembro (independiente de si los representa)
  equiposMiembro: string[];

  // Alcance: qué organizadores administra (puede tener varios)
  organizadores: string[];

  // Alcance: qué patrocinadores administra (puede tener varios)
  patrocinadores: string[];

  /**
   * Alcance especial de tutela — NO es una asignación de rol con scope
   * como las anteriores; se calcula directo desde `usuarios.id_tutor`.
   * Lista de id_usuario de las cuentas de MENORES que este usuario
   * gestiona. Un usuario con esta lista no vacía puede actuar en
   * nombre de esos corredores (inscribirlos, ver su historial) — pero
   * él mismo sigue siendo una cuenta autogestionada normal, con su
   * propio historial de corredor independiente del de sus dependientes.
   */
  corredoresGestionados: string[];
}

/**
 * Se construye en el login/refresh a partir de una consulta a
 * `asignaciones_rol` + `miembros_equipo`, no se guarda tal cual en DB.
 */
export interface RequestWithUser extends Request {
  user: JwtPayload;
  ip: string;
}
