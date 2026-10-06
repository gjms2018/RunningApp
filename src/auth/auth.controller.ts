import { Body, Controller, Ip, Headers, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { AuthService } from '../services/auth.service';
import { RecuperacionPasswordService } from '../services/recuperacion-password.service';

class LoginBodyDto {
  email: string;
  password: string;
}

class RefreshBodyDto {
  refreshToken: string;
}

class SolicitarRecuperacionBodyDto {
  email: string;
}

class RestablecerPasswordBodyDto {
  token: string;
  passwordNueva: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private recuperacionService: RecuperacionPasswordService,
  ) {}

  @Public()
  @Post('login')
  async login(
    @Body() body: LoginBodyDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.login({
      email: body.email,
      password: body.password,
      direccionIp: ip,
      userAgent,
    });
  }

  /**
   * El refresh token NO pasa por JwtAuthGuard (está marcado @Public())
   * porque el access token ya expiró — es justo el caso que este
   * endpoint resuelve. La validez la verifica AuthService.refrescar()
   * directamente contra el refresh token recibido en el body.
   */
  @Public()
  @Post('refresh')
  async refrescar(@Body() body: RefreshBodyDto) {
    return this.authService.refrescar(body.refreshToken);
  }

  /**
   * Respuesta SIEMPRE genérica, exista o no el correo — ver el
   * comentario en RecuperacionPasswordService.solicitar() sobre por qué
   * no se debe distinguir la respuesta según exista la cuenta o no.
   */
  @Public()
  @Post('forgot-password')
  async solicitarRecuperacion(
    @Body() body: SolicitarRecuperacionBodyDto,
    @Ip() ip: string,
  ) {
    await this.recuperacionService.solicitar({
      email: body.email,
      direccionIp: ip,
    });

    return {
      mensaje:
        'Si el correo existe en nuestro sistema, recibirás un enlace de recuperación.',
    };
  }

  @Public()
  @Post('reset-password')
  async restablecerPassword(@Body() body: RestablecerPasswordBodyDto) {
    await this.recuperacionService.restablecer({
      token: body.token,
      passwordNueva: body.passwordNueva,
    });

    return { mensaje: 'Contraseña actualizada correctamente' };
  }
}
