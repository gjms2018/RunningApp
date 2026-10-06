import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

interface LoginDto {
  email: string;
  password: string;
  direccionIp: string;
  userAgent?: string;
}

interface TokensRespuesta {
  accessToken: string;
  refreshToken: string;
}

/** Umbral y ventana del bloqueo por fuerza bruta, definidos en el
 * diagrama conceptual original: "3 fallos seguidos -> bloqueo 15 min". */
const MAX_INTENTOS_FALLIDOS = 3;
const VENTANA_MINUTOS = 15;
const BLOQUEO_MINUTOS = 15;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario)
    private usuariosRepo: Repository<Usuario>,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<TokensRespuesta> {
    const usuario = await this.usuariosRepo.findOne({
      where: { email: dto.email },
    });

    // Mismo criterio de mensaje neutro que usamos en recuperación de
    // contraseña: no revelar si el fallo fue por email inexistente o
    // contraseña incorrecta.
    if (!usuario) {
      await this.registrarIntentoFallido(dto, null);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Chequeo de bloqueo ANTES de verificar la contraseña: si ya está
    // bloqueado, no tiene sentido gastar un bcrypt.compare (que es
    // intencionalmente costoso en CPU) ni sumar otro intento fallido.
    await this.verificarNoBloqueado(usuario.idUsuario, dto);

    const passwordValida = await bcrypt.compare(
      dto.password,
      usuario.passwordHash,
    );

    if (!passwordValida) {
      await this.registrarIntentoFallido(dto, usuario.idUsuario);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.registrarIntentoExitoso(dto, usuario.idUsuario);

    const payload = await this.construirPayload(usuario.idUsuario, usuario.email);

    return this.emitirTokens(payload);
  }

  /**
   * Refresca el access token a partir de un refresh token válido,
   * reconstruyendo el payload con el estado ACTUAL de asignaciones_rol
   * (ver nota en construirPayload). No reemite un nuevo refresh token
   * en este ejemplo simplificado; en producción conviene rotar también
   * el refresh token para invalidar el anterior.
   */
  async refrescar(refreshToken: string): Promise<TokensRespuesta> {
    let idUsuario: string;
    try {
      const decoded = this.jwtService.verify<{ idUsuario: string }>(
        refreshToken,
      );
      idUsuario = decoded.idUsuario;
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const usuario = await this.usuariosRepo.findOne({ where: { idUsuario } });
    if (!usuario) {
      throw new UnauthorizedException('Usuario ya no existe');
    }

    const payload = await this.construirPayload(usuario.idUsuario, usuario.email);
    return this.emitirTokens(payload);
  }

  /**
   * Cuenta los fallos consecutivos MÁS RECIENTES del usuario dentro de la
   * ventana de tiempo. "Consecutivos" es clave: un intento exitoso en
   * medio del conteo resetea el contador — no se acumulan fallos viejos
   * de hace semanas junto con uno de hoy.
   */
  private async verificarNoBloqueado(
    idUsuario: string,
    dto: LoginDto,
  ): Promise<void> {
    const ultimosIntentos = await this.usuariosRepo.manager.query(
      `SELECT resultado, fecha_hora FROM logs_acceso
       WHERE id_usuario = $1
         AND fecha_hora > NOW() - ($2 || ' minutes')::interval
       ORDER BY fecha_hora DESC
       LIMIT $3`,
      [idUsuario, VENTANA_MINUTOS, MAX_INTENTOS_FALLIDOS],
    );

    const todosFallidosRecientes =
      ultimosIntentos.length === MAX_INTENTOS_FALLIDOS &&
      ultimosIntentos.every(
        (i: any) => i.resultado === 'contrasena_incorrecta',
      );

    if (!todosFallidosRecientes) {
      return;
    }

    const fechaUltimoFallo = new Date(ultimosIntentos[0].fecha_hora);
    const minutosTranscurridos =
      (Date.now() - fechaUltimoFallo.getTime()) / 60000;

    if (minutosTranscurridos < BLOQUEO_MINUTOS) {
      await this.registrarBloqueo(dto, idUsuario);
      const minutosRestantes = Math.ceil(
        BLOQUEO_MINUTOS - minutosTranscurridos,
      );
      throw new ForbiddenException(
        `Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en ${minutosRestantes} minuto(s).`,
      );
    }
    // Si ya pasó la ventana de bloqueo, se permite reintentar
    // normalmente (el próximo fallo, si ocurre, reinicia el conteo).
  }

  private async registrarBloqueo(
    dto: LoginDto,
    idUsuario: string,
  ): Promise<void> {
    await this.usuariosRepo.manager.query(
      `INSERT INTO logs_acceso
        (id_usuario, email_intentado, direccion_ip, user_agent, resultado)
       VALUES ($1, $2, $3, $4, 'usuario_bloqueado')`,
      [idUsuario, dto.email, dto.direccionIp, dto.userAgent ?? null],
    );
  }

  /**
   * Reconstruye el payload leyendo el estado ACTUAL de asignaciones_rol
   * y miembros_equipo. Se invoca en login y en refresh — es el único
   * punto donde el sistema "se pone al día" con cambios de rol.
   */
  private async construirPayload(
    idUsuario: string,
    email: string,
  ): Promise<JwtPayload> {
    const [asignaciones, membresias, dependientes] = await Promise.all([
      this.usuariosRepo.manager.query(
        `SELECT tipo_rol, id_equipo, id_organizador, id_patrocinador
         FROM asignaciones_rol WHERE id_usuario = $1`,
        [idUsuario],
      ),
      this.usuariosRepo.manager.query(
        `SELECT id_equipo FROM miembros_equipo WHERE id_usuario = $1`,
        [idUsuario],
      ),
      this.usuariosRepo.manager.query(
        `SELECT id_usuario FROM usuarios WHERE id_tutor = $1`,
        [idUsuario],
      ),
    ]);

    return {
      idUsuario,
      email,
      equiposRepresentados: asignaciones
        .filter((a: any) => a.tipo_rol === 'representante_equipo')
        .map((a: any) => a.id_equipo),
      organizadores: asignaciones
        .filter((a: any) => a.tipo_rol === 'organizador')
        .map((a: any) => a.id_organizador),
      patrocinadores: asignaciones
        .filter((a: any) => a.tipo_rol === 'patrocinador')
        .map((a: any) => a.id_patrocinador),
      equiposMiembro: membresias.map((m: any) => m.id_equipo),
      corredoresGestionados: dependientes.map((d: any) => d.id_usuario),
    };
  }

  /**
   * Expone la emisión de tokens para que UsuariosService pueda loguear
   * automáticamente a un corredor recién registrado, sin duplicar la
   * lógica de construirPayload/emitirTokens que ya vive aquí.
   */
  async emitirTokensPara(idUsuario: string, email: string): Promise<TokensRespuesta> {
    const payload = await this.construirPayload(idUsuario, email);
    return this.emitirTokens(payload);
  }

  private emitirTokens(payload: JwtPayload): TokensRespuesta {
    return {
      // Corto: fuerza a que el alcance se refresque seguido (ver nota en JwtStrategy)
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
      // Largo: solo lleva idUsuario, se usa para volver a llamar construirPayload()
      refreshToken: this.jwtService.sign(
        { idUsuario: payload.idUsuario },
        { expiresIn: '7d' },
      ),
    };
  }

  private async registrarIntentoFallido(
    dto: LoginDto,
    idUsuario: string | null,
  ): Promise<void> {
    await this.usuariosRepo.manager.query(
      `INSERT INTO logs_acceso
        (id_usuario, email_intentado, direccion_ip, user_agent, resultado)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        idUsuario,
        dto.email,
        dto.direccionIp,
        dto.userAgent ?? null,
        idUsuario ? 'contrasena_incorrecta' : 'fallo_general',
      ],
    );
  }

  private async registrarIntentoExitoso(
    dto: LoginDto,
    idUsuario: string,
  ): Promise<void> {
    await this.usuariosRepo.manager.query(
      `INSERT INTO logs_acceso
        (id_usuario, email_intentado, direccion_ip, user_agent, resultado)
       VALUES ($1, $2, $3, $4, 'exito')`,
      [idUsuario, dto.email, dto.direccionIp, dto.userAgent ?? null],
    );
  }
}
