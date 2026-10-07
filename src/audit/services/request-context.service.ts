import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface ContextoRequest {
  // null en rutas @Public() (login, registro, recuperación de contraseña)
  idUsuario: string | null;
  direccionIp: string;
  userAgent?: string;
  /** IDs de corredores menores que este usuario gestiona como Tutor. */
  corredoresGestionados: string[];
}

export type ContextoAutenticado = ContextoRequest & { idUsuario: string };

/**
 * Singleton con AsyncLocalStorage: cada petición HTTP ve su propio
 * contexto, sin necesitar Scope.REQUEST.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<ContextoRequest>();

  set(contexto: ContextoRequest) {
    this.storage.enterWith(contexto);
  }

  get(): ContextoRequest {
    const ctx = this.storage.getStore();
    if (!ctx) {
      throw new Error('RequestContextService no fue inicializado en este request');
    }
    return ctx;
  }

  getAutenticado(): ContextoAutenticado {
    const ctx = this.get();
    if (!ctx.idUsuario) {
      throw new UnauthorizedException('Se requiere un usuario autenticado');
    }
    return { ...ctx, idUsuario: ctx.idUsuario };
  }
}