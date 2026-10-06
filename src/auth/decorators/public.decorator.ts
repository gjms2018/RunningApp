import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Uso:
 *   @Public()
 *   @Post('login')
 *   login(...) { ... }
 *
 * Sin este decorador, JwtAuthGuard (aplicado globalmente) bloquea la ruta.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
