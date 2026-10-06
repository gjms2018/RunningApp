import {
  IsDateString,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegistrarUsuarioDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre: string;

  @IsEmail()
  @MaxLength(150)
  email: string;

  // Mínimo 8 caracteres, al menos una letra y un número — balance entre
  // seguridad razonable y no frustrar a corredores que no son técnicos.
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, {
    message:
      'La contraseña debe tener al menos 8 caracteres, con letras y números',
  })
  password: string;

  @IsString()
  @MinLength(5)
  @MaxLength(50)
  dniPasaporte: string;

  @IsDateString()
  fechaNacimiento: string;
}
