import { ConflictException, Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Usuario } from './entities/usuario.entity';
import { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';
import { CrearMenorDto } from './dto/crear-menor.dto';

// Edad mínima para autorregistrarse sin intervención de un adulto.
// Menores por debajo de este umbral quedan fuera del autorregistro en
// esta fase — el sistema no contempla todavía consentimiento de tutor,
// que sería el paso natural para soportar corredores más jóvenes.
const EDAD_MINIMA_ANIOS = 16;

// Edad mínima para poder ser Tutor de una cuenta de menor.
const EDAD_MINIMA_TUTOR_ANIOS = 18;

const COSTO_BCRYPT = 10;

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private usuariosRepo: Repository<Usuario>,
  ) {}

  async registrar(dto: RegistrarUsuarioDto): Promise<{ idUsuario: string; email: string }> {
    this.validarEdadMinima(dto.fechaNacimiento);

    // Se valida ANTES del bcrypt.hash (costoso en CPU) para no gastar
    // ese trabajo si la petición va a fallar de todas formas por
    // duplicado. Aun así, la garantía real contra condiciones de carrera
    // sigue siendo el UNIQUE de la base de datos (ver catch abajo).
    await this.validarNoDuplicado(dto.email, dto.dniPasaporte);

    const passwordHash = await bcrypt.hash(dto.password, COSTO_BCRYPT);
    const idUsuario = randomUUID();

    try {
      await this.usuariosRepo.manager.query(
        `INSERT INTO usuarios
          (id_usuario, nombre, email, password_hash, dni_pasaporte, fecha_nacimiento)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          idUsuario,
          dto.nombre.trim(),
          dto.email.trim().toLowerCase(),
          passwordHash,
          dto.dniPasaporte.trim(),
          dto.fechaNacimiento,
        ],
      );
    } catch (error) {
      // Última línea de defensa contra condiciones de carrera: dos
      // registros simultáneos con el mismo email/DNI que pasaron la
      // validación previa casi al mismo tiempo. El UNIQUE de la base
      // rechaza el segundo INSERT; aquí solo se traduce a un mensaje
      // claro en vez de dejar pasar el error crudo de Postgres.
      if (this.esErrorDeDuplicado(error)) {
        throw new ConflictException(
          'El correo o el documento de identidad ya están registrados',
        );
      }
      throw error;
    }

    return { idUsuario, email: dto.email.trim().toLowerCase() };
  }

  /**
   * Crea la cuenta de un corredor menor de edad, gestionada por el
   * Tutor que hace la llamada (su propia cuenta autogestionada). La
   * fila resultante NUNCA lleva email ni password_hash — un menor no
   * puede legalmente tener credenciales propias en este sistema, sin
   * excepción. El Tutor gestiona TODA su actividad (inscripciones,
   * historial) con su propia sesión; el menor nunca inicia sesión.
   */
  async crearMenor(
    idTutor: string,
    dto: CrearMenorDto,
  ): Promise<{ idUsuario: string }> {
    await this.validarPuedeSerTutor(idTutor);
    this.validarEsMenor(dto.fechaNacimiento);

    if (dto.dniPasaporte) {
      const existente = await this.usuariosRepo.manager.query(
        `SELECT 1 FROM usuarios WHERE dni_pasaporte = $1`,
        [dto.dniPasaporte.trim()],
      );
      if (existente.length > 0) {
        throw new ConflictException('Ese documento de identidad ya está registrado');
      }
    }

    const idUsuario = randomUUID();

    await this.usuariosRepo.manager.query(
      `INSERT INTO usuarios
        (id_usuario, nombre, email, password_hash, dni_pasaporte, fecha_nacimiento, id_tutor)
       VALUES ($1, $2, NULL, NULL, $3, $4, $5)`,
      [idUsuario, dto.nombre.trim(), dto.dniPasaporte?.trim() ?? null, dto.fechaNacimiento, idTutor],
    );

    return { idUsuario };
  }

  /**
   * Un Tutor debe ser: (a) una cuenta autogestionada él mismo — no se
   * permite que un menor gestionado sea a su vez tutor de otro menor
   * (evita cadenas de tutela sin responsable real), y (b) mayor de 18.
   */
  private async validarPuedeSerTutor(idTutor: string): Promise<void> {
    const filas = await this.usuariosRepo.manager.query(
      `SELECT id_tutor, fecha_nacimiento FROM usuarios WHERE id_usuario = $1`,
      [idTutor],
    );

    if (filas.length === 0) {
      throw new NotFoundException('Cuenta de tutor no encontrada');
    }

    const tutor = filas[0];

    if (tutor.id_tutor !== null) {
      throw new ForbiddenException(
        'Una cuenta gestionada por un tutor no puede, a su vez, ser tutora de otra cuenta',
      );
    }

    if (this.calcularEdad(tutor.fecha_nacimiento) < EDAD_MINIMA_TUTOR_ANIOS) {
      throw new ForbiddenException(
        `Debes tener al menos ${EDAD_MINIMA_TUTOR_ANIOS} años para registrar a un corredor menor de edad`,
      );
    }
  }

  private validarEsMenor(fechaNacimiento: string): void {
    if (this.calcularEdad(fechaNacimiento) >= EDAD_MINIMA_TUTOR_ANIOS) {
      throw new BadRequestException(
        'Para registrar a alguien mayor de edad, debe crear su propia cuenta con autorregistro',
      );
    }
  }

  private validarEdadMinima(fechaNacimiento: string): void {
    if (this.calcularEdad(fechaNacimiento) < EDAD_MINIMA_ANIOS) {
      throw new BadRequestException(
        `Debes tener al menos ${EDAD_MINIMA_ANIOS} años para registrarte`,
      );
    }
  }

  private calcularEdad(fechaNacimiento: string): number {
    const nacimiento = new Date(fechaNacimiento);
    const hoy = new Date();

    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const aunNoCumpleEsteAnio =
      hoy.getMonth() < nacimiento.getMonth() ||
      (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate());
    if (aunNoCumpleEsteAnio) {
      edad--;
    }
    return edad;
  }

  private async validarNoDuplicado(email: string, dniPasaporte: string): Promise<void> {
    const existente = await this.usuariosRepo.manager.query(
      `SELECT email, dni_pasaporte FROM usuarios WHERE email = $1 OR dni_pasaporte = $2`,
      [email.trim().toLowerCase(), dniPasaporte.trim()],
    );

    if (existente.length > 0) {
      throw new ConflictException(
        'El correo o el documento de identidad ya están registrados',
      );
    }
  }

  private esErrorDeDuplicado(error: unknown): boolean {
    // Código 23505 = unique_violation en Postgres
    return (error as { code?: string })?.code === '23505';
  }
}
