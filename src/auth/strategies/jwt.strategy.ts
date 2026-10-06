import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * NOTA IMPORTANTE sobre el alcance en el JWT:
 *
 * El payload lleva las listas de asignaciones (organizadores, equipos, etc.)
 * en el momento en que se emitió el token — no se recalculan en cada
 * request. Esto es una decisión consciente de rendimiento (evita 4 queries
 * extra por request), pero tiene una consecuencia: si a un usuario le
 * ASIGNAN o le QUITAN un rol mientras su token sigue vigente, el cambio
 * no se refleja hasta que el token expire o se refresque.
 *
 * Por eso el tiempo de vida del access token debe ser corto (ver
 * AuthService: 15 minutos) y el refresh token es el que fuerza a
 * reconstruir el payload desde la base de datos con datos frescos.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(Usuario)
    private usuariosRepo: Repository<Usuario>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Passport invoca esto automáticamente tras verificar la firma y
   * expiración del token. Lo que retornamos aquí es lo que termina en
   * `request.user`.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Chequeo mínimo de que el usuario del token sigue existiendo
    // (por si fue eliminado después de emitido el token).
    const existe = await this.usuariosRepo.exist({
      where: { idUsuario: payload.idUsuario },
    });

    if (!existe) {
      throw new UnauthorizedException('Usuario del token ya no existe');
    }

    return payload;
  }
}
