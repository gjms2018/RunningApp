import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Se aplica GLOBALMENTE (ver main.ts / AppModule con APP_GUARD) para que
 * toda ruta requiera JWT válido por defecto — el modelo "seguro por
 * defecto" es más difícil de romper por descuido que tener que acordarse
 * de poner @UseGuards(JwtAuthGuard) en cada controller nuevo.
 *
 * Las rutas que sí deben ser públicas (login, registro, recuperación de
 * contraseña) se marcan explícitamente con @Public().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const esPublica = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (esPublica) {
      return true;
    }

    return super.canActivate(context);
  }
}
