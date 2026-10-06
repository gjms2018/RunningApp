import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CrearCarreraDto {
  @IsString()
  @MinLength(3)
  nombreEvento: string;

  @IsDateString()
  fechaEvento: string;

  @IsNumber()
  @IsPositive()
  distanciaKm: number;

  // 0 = sin requisito previo (ej. la carrera semilla). No se usa
  // @IsPositive() a propósito: 0 es un valor válido y distinto de
  // "no enviado".
  @IsOptional()
  @IsNumber()
  @Min(0)
  distanciaRequeridaKm?: number;

  @IsInt()
  @IsPositive()
  cupoMaximo: number;

  @IsNumber()
  @Min(0)
  costoInscripcion: number;
}
