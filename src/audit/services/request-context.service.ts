import { Injectable, Scope, UnauthorizedException } from '@nestjs/common';

export interface ContextoRequest {
  // null en rutas @Public() (login, registro, recuperación de
  // contraseña) donde no hay un actor autenticado. Los servicios que
  // consumen este contexto vía RequestContextService.get() SIEMPRE se
  // invocan desde rutas protegidas, así que en la práctica nunca lo
  // reciben en null — pero el tipo lo refleja con honestidad.
  idUsuario: string | null;
  direccionIp: string;
  userAgent?: string;
  /**
   * IDs de corredores menores que este usuario gestiona como Tutor
   * (calculado en el JWT vía usuarios.id_tutor, ver AuthService).
   * Cualquier servicio que necesite validar "¿puede este actor
   * inscribir/gestionar a este corredor?" consulta esta lista, sin
   * depender de que el controller ya lo haya validado.
   */
  corredoresGestionados: string[];
}

// Mismo contexto, pero con el actor garantizado
export type ContextoAutenticado = ContextoRequest & { idUsuario: string };


/**
 * Request-scoped: NestJS crea una instancia nueva por cada petición HTTP.
 * Se llena en un middleware/guard temprano y lo consumen los servicios
 * que necesitan escribir auditoría, sin tener que pasar ip/usuario como
 * parámetro explícito en cada método de negocio.
 */
@Injectable({ scope: Scope.REQUEST })
export class RequestContextService {
  private contexto: ContextoRequest;

  set(contexto: ContextoRequest) {
    this.contexto = contexto;
  }

  get(): ContextoRequest {
    if (!this.contexto) {
      throw new Error('RequestContextService no fue inicializado en este request');
    }
    return this.contexto;
  }

/**
   * Para servicios de rutas protegidas: falla si no hay actor
   * autenticado, y devuelve idUsuario tipado como string.
   */
  getAutenticado(): ContextoAutenticado {
    const ctx = this.get();
    if (!ctx.idUsuario) {
      throw new UnauthorizedException('Se requiere un usuario autenticado');
    }
    return { ...ctx, idUsuario: ctx.idUsuario };
  }


}
