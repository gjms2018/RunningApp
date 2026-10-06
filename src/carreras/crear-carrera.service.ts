import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { RequestContextService } from '../audit/services/request-context.service';
import { CrearCarreraDto } from './dto/crear-carrera.dto';

@Injectable()
export class CrearCarreraService {
  constructor(
    private dataSource: DataSource,
    private requestContext: RequestContextService,
  ) {}

  async crear(
    idOrganizador: string,
    dto: CrearCarreraDto,
  ): Promise<{ idCarrera: string }> {
    const { idUsuario, direccionIp } = this.requestContext.get();

    if (new Date(dto.fechaEvento).getTime() < Date.now()) {
      throw new BadRequestException('La fecha del evento no puede estar en el pasado');
    }

    // La distancia requerida no puede ser mayor o igual a la propia
    // distancia de la carrera — pedir un 10K previo para correr un 10K
    // no tiene sentido de negocio (sería un requisito imposible de
    // cumplir la primera vez que se organiza esa distancia).
    const distanciaRequerida = dto.distanciaRequeridaKm ?? 0;
    if (distanciaRequerida >= dto.distanciaKm) {
      throw new BadRequestException(
        'La distancia requerida debe ser menor a la distancia de esta carrera',
      );
    }

    const idCarrera = randomUUID();

    await this.dataSource.query(
      `INSERT INTO carreras
        (id_carrera, id_organizador, nombre_evento, fecha_evento, distancia_km,
         distancia_requerida_km, cupo_maximo, cupos_disponibles, costo_inscripcion,
         estado_evento, creado_por_id_usuario, creado_desde_ip, origen_modificacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, 'programada', $9, $10, 'usuario')`,
      [
        idCarrera,
        idOrganizador,
        dto.nombreEvento.trim(),
        dto.fechaEvento,
        dto.distanciaKm,
        distanciaRequerida,
        dto.cupoMaximo, // $7 se reutiliza para cupo_maximo Y cupos_disponibles iniciales
        dto.costoInscripcion,
        idUsuario,
        direccionIp,
      ],
    );

    return { idCarrera };
  }
}
