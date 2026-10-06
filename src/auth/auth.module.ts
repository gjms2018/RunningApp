import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RecuperacionPasswordService } from './services/recuperacion-password.service';
import { MailerService } from './services/mailer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario]),
    PassportModule,
    // registerAsync porque el secreto sale de ConfigService, no de un
    // valor estático — necesario para no hardcodear JWT_SECRET aquí.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        // El signOptions por defecto queda vacío a propósito: cada
        // llamada a jwtService.sign() en AuthService especifica su
        // propio expiresIn (15m para access, 7d para refresh) — un
        // default global aquí solo generaría confusión sobre cuál
        // valor realmente aplica.
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RecuperacionPasswordService, MailerService],
  // AuthService se exporta porque UsuariosController lo usa directo
  // para loguear automáticamente a un corredor recién registrado.
  exports: [AuthService],
})
export class AuthModule {}
