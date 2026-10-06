import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Un menor NUNCA recibe correo ni contraseña propios — legalmente no
 * puede tener credenciales en este sistema. Su cuenta existe solo para
 * acumular historial real de carreras; toda su gestión (inscripciones,
 * consultas) la hace siempre el Tutor con su propia sesión.
 */
export class CrearMenorDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre: string;

  @IsDateString()
  fechaNacimiento: string;

  // Opcional: muchos menores todavía no tienen documento de identidad propio
  @IsOptional()
  @IsString()
  @MaxLength(50)
  dniPasaporte?: string;
}
