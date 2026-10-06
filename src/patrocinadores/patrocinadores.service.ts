import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { RequestContextService } from '../audit/services/request-context.service';

interface CrearPatrocinadorDto {
  nombreMarca: string;
  identificacionFiscal?: string;
  telefono?: string;
  logoUrl?: string;
  cuentaBancariaReferencia?: string;
}

interface AgregarCoDuenoDto {
  idPatrocinador: string;
  emailNuevoDueno: string;
}

/** Espejo exacto de OrganizadoresService — ver comentarios ahí para el razonamiento completo. */
@Injectable()
export class PatrocinadoresService {
  constructor(
    private dataSource: DataSource,
    private requestContext: RequestContextService,
  ) {}

  async crear(dto: CrearPatrocinadorDto): Promise<{ idPatrocinador: string }> {
    const { idUsuario, direccionIp } = this.requestContext.get();

    return this.dataSource.transaction(async (manager) => {
      const idPatrocinador = randomUUID();

      await manager.query(
        `INSERT INTO patrocinadores
          (id_patrocinador, nombre_marca, identificacion_fiscal, telefono, logo_url,
           cuenta_bancaria_referencia, creado_por_id_usuario, creado_desde_ip, origen_modificacion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'usuario')`,
        [
          idPatrocinador,
          dto.nombreMarca,
          dto.identificacionFiscal ?? null,
          dto.telefono ?? null,
          dto.logoUrl ?? null,
          dto.cuentaBancariaReferencia ?? null,
          idUsuario,
          direccionIp,
        ],
      );

      await manager.query(
        `INSERT INTO asignaciones_rol (id_asignacion, id_usuario, tipo_rol, id_patrocinador)
         VALUES ($1, $2, 'patrocinador', $3)`,
        [randomUUID(), idUsuario, idPatrocinador],
      );

      return { idPatrocinador };
    });
  }

  async agregarCoDueno(dto: AgregarCoDuenoDto): Promise<void> {
    const nuevoDuenoFilas = await this.dataSource.query(
      `SELECT id_usuario, id_tutor FROM usuarios WHERE email = $1`,
      [dto.emailNuevoDueno.trim().toLowerCase()],
    );

    if (nuevoDuenoFilas.length === 0) {
      throw new NotFoundException(
        'No existe ninguna cuenta autogestionada con ese correo',
      );
    }

    const nuevoDueno = nuevoDuenoFilas[0];

    if (nuevoDueno.id_tutor !== null) {
      throw new ForbiddenException(
        'Una cuenta gestionada por un tutor no puede ser dueña de un patrocinador',
      );
    }

    const yaEsDueno = await this.dataSource.query(
      `SELECT 1 FROM asignaciones_rol
       WHERE id_usuario = $1 AND tipo_rol = 'patrocinador' AND id_patrocinador = $2`,
      [nuevoDueno.id_usuario, dto.idPatrocinador],
    );

    if (yaEsDueno.length > 0) {
      throw new ConflictException('Esa persona ya es dueña de este patrocinador');
    }

    await this.dataSource.query(
      `INSERT INTO asignaciones_rol (id_asignacion, id_usuario, tipo_rol, id_patrocinador)
       VALUES ($1, $2, 'patrocinador', $3)`,
      [randomUUID(), nuevoDueno.id_usuario, dto.idPatrocinador],
    );
  }
}
