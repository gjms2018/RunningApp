import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestContextService } from './request-context.service';
import { RequestWithUser } from '../../auth/interfaces/jwt-payload.interface';

/**
 * CORRECCIÓN DE DISEÑO: esto originalmente se intentó como middleware
 * (NestMiddleware), pero en el ciclo de vida de NestJS los middlewares
 * corren ANTES que los guards — en ese punto JwtAuthGuard todavía no ha
 * poblado `request.user` a partir del JWT, así que el contexto habría
 * quedado vacío para toda ruta autenticada.
 *
 * Los interceptores, en cambio, corren DESPUÉS de los guards (y antes
 * de llegar al controller), que es exactamente el momento correcto:
 * `request.user` ya existe (si la ruta lo requiere) cuando este
 * interceptor se ejecuta.
 *
 * Se registra como APP_INTERCEPTOR global en AppModule.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private requestContext: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const direccionIp =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.socket?.remoteAddress ||
      'desconocida';

    this.requestContext.set({
      // request.user es undefined en rutas @Public() (ej. login,
      // registro) — el contexto queda con idUsuario null en esos casos,
      // que es correcto: nada en esas rutas necesita auditoría de actor.
      idUsuario: request.user?.idUsuario ?? null,
      direccionIp,
      userAgent: request.headers['user-agent'],
      corredoresGestionados: request.user?.corredoresGestionados ?? [],
    });

    return next.handle();
  }
}
