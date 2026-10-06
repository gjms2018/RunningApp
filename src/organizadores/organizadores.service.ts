import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { RequestContextService } from '../audit/services/request-context.service';

interface CrearOrganizadorDto {
  nombreEmpresa: string;
  identificacionFiscal?: string;
  telefono?: string;
  cuentaBancariaPago?: string;
}

interface AgregarCoDuenoDto {
  idOrganizador: string;
  emailNuevoDueno: string;
}

/**
 * Espejo deliberado de EquiposService: crear un Organizador es
 * autoservicio, sin aprobación previa (coherente con "ofrecerlo gratis"
 * en Fase 2) — el creador queda asignado automáticamente. La única
 * pieza que NO tiene equivalente en equipos es agregarCoDueno: varios
 * usuarios pueden compartir la titularidad del MISMO Organizador (por
 * ejemplo, dos socios administrando la misma empresa de eventos), algo
 * que el modelo de asignaciones_rol ya soporta de forma nativa sin
 * cambios de esquema.
 */
@Injectable()
export class OrganizadoresService {
  constructor(
    private dataSource: DataSource,
    private requestContext: RequestContextService,
  ) {}

  async crear(dto: CrearOrganizadorDto): Promise<{ idOrganizador: string }> {
    const { idUsuario, direccionIp } = this.requestContext.get();

    return this.dataSource.transaction(async (manager) => {
      const idOrganizador = randomUUID();

      await manager.query(
        `INSERT INTO organizadores
          (id_organizador, nombre_empresa, identificacion_fiscal, telefono,
           cuenta_bancaria_pago, creado_por_id_usuario, creado_desde_ip, origen_modificacion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'usuario')`,
        [
          idOrganizador,
          dto.nombreEmpresa,
          dto.identificacionFiscal ?? null,
          dto.telefono ?? null,
          dto.cuentaBancariaPago ?? null,
          idUsuario,
          direccionIp,
        ],
      );

      await manager.query(
        `INSERT INTO asignaciones_rol (id_asignacion, id_usuario, tipo_rol, id_organizador)
         VALUES ($1, $2, 'organizador', $3)`,
        [randomUUID(), idUsuario, idOrganizador],
      );

      return { idOrganizador };
    });
  }

  /**
   * Solo un dueño EXISTENTE de este Organizador puede agregar a otro —
   * el guard del controller ya lo garantiza (mismo alcance 'directo'
   * que protege el resto de acciones de organizador). El nuevo
   * co-dueño se busca por correo y debe ser una cuenta autogestionada
   * (un menor gestionado por tutor no puede ser dueño de un
   * organizador, mismo criterio que ya se aplicó para Tutor).
   */
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
        'Una cuenta gestionada por un tutor no puede ser dueña de un organizador',
      );
    }

    const yaEsDueno = await this.dataSource.query(
      `SELECT 1 FROM asignaciones_rol
       WHERE id_usuario = $1 AND tipo_rol = 'organizador' AND id_organizador = $2`,
      [nuevoDueno.id_usuario, dto.idOrganizador],
    );

    if (yaEsDueno.length > 0) {
      throw new ConflictException('Esa persona ya es dueña de este organizador');
    }

    await this.dataSource.query(
      `INSERT INTO asignaciones_rol (id_asignacion, id_usuario, tipo_rol, id_organizador)
       VALUES ($1, $2, 'organizador', $3)`,
      [randomUUID(), nuevoDueno.id_usuario, dto.idOrganizador],
    );
  }
}
