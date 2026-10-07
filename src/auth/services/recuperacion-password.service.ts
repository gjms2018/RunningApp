import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { MailerService } from './mailer.service';

interface SolicitarRecuperacionDto {
  email: string;
  direccionIp: string;
}

interface RestablecerPasswordDto {
  token: string;
  passwordNueva: string;
}

const EXPIRACION_HORAS = 1;
const BYTES_TOKEN = 32; // 256 bits — el valor que se envía por correo

@Injectable()
export class RecuperacionPasswordService {
  constructor(
    @InjectRepository(Usuario)
    private usuariosRepo: Repository<Usuario>,
    private mailerService: MailerService,
  ) {}

  /**
   * Siempre responde igual, exista o no el correo — el mensaje neutro
   * que ya definimos ("si el correo existe, recibirás un enlace") evita
   * que un atacante use este endpoint para enumerar qué correos están
   * registrados en la plataforma.
   */
  async solicitar(dto: SolicitarRecuperacionDto): Promise<void> {
    const usuario = await this.usuariosRepo.findOne({
      where: { email: dto.email },
    });

    // Nótese: no se lanza excepción ni se distingue la respuesta.
    // Si no existe, simplemente no se genera token ni se envía correo.
if (!usuario || !usuario.email) {
  return;
}

    // El token que viaja por correo es el valor en claro; en la base
    // de datos solo se guarda su hash — igual que una contraseña. Así,
    // si la tabla tokens_recuperacion se filtrara, no serviría por sí
    // sola para restablecer ninguna cuenta.
    const tokenEnClaro = crypto.randomBytes(BYTES_TOKEN).toString('hex');
    const tokenHash = this.hashToken(tokenEnClaro);

    const fechaExpiracion = new Date();
    fechaExpiracion.setHours(fechaExpiracion.getHours() + EXPIRACION_HORAS);

    await this.usuariosRepo.manager.query(
      `INSERT INTO tokens_recuperacion (id_usuario, token_hash, fecha_expiracion, usado)
       VALUES ($1, $2, $3, FALSE)`,
      [usuario.idUsuario, tokenHash, fechaExpiracion],
    );

    await this.mailerService.enviarCorreoRecuperacion(
      usuario.email,
      tokenEnClaro,
    );

    // Se aprovecha logs_acceso para dejar trazabilidad de la solicitud,
    // tal como se definió en el diseño original de este flujo.
    await this.usuariosRepo.manager.query(
      `INSERT INTO logs_acceso
        (id_usuario, email_intentado, direccion_ip, user_agent, resultado)
       VALUES ($1, $2, $3, 'Solicitud de recuperación de contraseña', 'exito')`,
      [usuario.idUsuario, dto.email, dto.direccionIp],
    );
  }

  /**
   * Valida el token (vigente, no usado, corresponde a algún usuario),
   * actualiza la contraseña y marca el token como usado — todo en una
   * sola transacción para que no quede un estado a medias si algo falla.
   */
  async restablecer(dto: RestablecerPasswordDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token);

    await this.usuariosRepo.manager.transaction(async (manager) => {
      const filas = await manager.query(
        `SELECT id_token, id_usuario, fecha_expiracion, usado
         FROM tokens_recuperacion
         WHERE token_hash = $1
         FOR UPDATE`, // evita que dos requests concurrentes con el mismo
         // token (ej. usuario dando doble clic) lo consuman dos veces
        [tokenHash],
      );

      if (filas.length === 0) {
        throw new BadRequestException('Enlace de recuperación inválido');
      }

      const registro = filas[0];

      if (registro.usado) {
        throw new BadRequestException(
          'Este enlace ya fue utilizado. Solicita uno nuevo.',
        );
      }

      if (new Date(registro.fecha_expiracion).getTime() < Date.now()) {
        throw new BadRequestException(
          'Este enlace expiró. Solicita uno nuevo.',
        );
      }

      const nuevoHash = await bcrypt.hash(dto.passwordNueva, 10);

      await manager.query(
        `UPDATE usuarios SET password_hash = $1, actualizado_en = CURRENT_TIMESTAMP
         WHERE id_usuario = $2`,
        [nuevoHash, registro.id_usuario],
      );

      await manager.query(
        `UPDATE tokens_recuperacion SET usado = TRUE WHERE id_token = $1`,
        [registro.id_token],
      );
    });
  }

  /**
   * SHA-256 es suficiente aquí (a diferencia de bcrypt para contraseñas):
   * el token ya es aleatorio de alta entropía (256 bits), no una
   * contraseña elegida por un humano que un atacante podría intentar
   * adivinar por fuerza bruta offline. No necesita ser lento a propósito.
   */
  private hashToken(tokenEnClaro: string): string {
    return crypto.createHash('sha256').update(tokenEnClaro).digest('hex');
  }
}
