import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MiembroEquipo } from './entities/miembro-equipo.entity';
import { RequestContextService } from '../audit/services/request-context.service';

interface VerificarMiembroDto {
  idEquipo: string;
  idUsuarioMiembro: string;
}

/**
 * `miembros_equipo` es una tabla de auditoría tipo A (columnas simples,
 * sin historial en logs_auditoria) — coherente con la decisión tomada
 * antes: es un dato administrativo/social, no financiero ni de
 * resultado deportivo.
 *
 * Nota sobre autoverificación (caso mapeado en la conceptualización):
 * el guard del controller solo exige que el actor tenga rol
 * 'representante_equipo' sobre ESTE id_equipo — no distingue si el
 * miembro que está verificando es él mismo u otra persona. Es una
 * decisión deliberada: se permite, pero queda registrado sin ambigüedad
 * en `verificado_por_id_usuario`, que en ese caso coincide con
 * `id_usuario` de la fila. El frontend puede usar esa igualdad para
 * mostrar una etiqueta tipo "autoverificado" si se quiere ser
 * transparente con el resto del equipo.
 */
@Injectable()
export class VerificacionMiembroService {
  constructor(
    @InjectRepository(MiembroEquipo)
    private miembrosEquipoRepo: Repository<MiembroEquipo>,
    private requestContext: RequestContextService,
  ) {}

  async verificar(dto: VerificarMiembroDto): Promise<void> {
    const { idUsuario: idUsuarioActor, direccionIp } = this.requestContext.get();

    const membresia = await this.miembrosEquipoRepo.findOne({
      where: { idUsuario: dto.idUsuarioMiembro, idEquipo: dto.idEquipo },
    });

    if (!membresia) {
      throw new NotFoundException(
        'Ese usuario no pertenece a este equipo (no existe la membresía)',
      );
    }

    if (membresia.verificado) {
      throw new BadRequestException(
        `Este miembro ya está verificado desde ${membresia.fechaVerificacion?.toISOString()}`,
      );
    }

    await this.miembrosEquipoRepo.update(
      { idUsuario: dto.idUsuarioMiembro, idEquipo: dto.idEquipo },
      {
        verificado: true,
        verificadoPorIdUsuario: idUsuarioActor,
        fechaVerificacion: new Date(),
        modificadoPorIdUsuario: idUsuarioActor,
        modificadoDesdeIp: direccionIp,
        modificadoEn: new Date(),
        origenModificacion: 'usuario',
      },
    );
  }

  /**
   * Contraparte natural de verificar(): retira el check sin borrar el
   * historial de quién lo otorgó originalmente en primer lugar — por
   * eso NO se limpian verificadoPorIdUsuario ni fechaVerificacion, solo
   * se apaga el booleano. Útil si el Representante detecta que otorgó
   * el check por error, o si la persona resultó no pertenecer realmente
   * al equipo.
   */
  async revocar(dto: VerificarMiembroDto): Promise<void> {
    const { idUsuario: idUsuarioActor, direccionIp } = this.requestContext.get();

    const membresia = await this.miembrosEquipoRepo.findOne({
      where: { idUsuario: dto.idUsuarioMiembro, idEquipo: dto.idEquipo },
    });

    if (!membresia) {
      throw new NotFoundException(
        'Ese usuario no pertenece a este equipo (no existe la membresía)',
      );
    }

    if (!membresia.verificado) {
      throw new BadRequestException('Este miembro no está verificado actualmente');
    }

    await this.miembrosEquipoRepo.update(
      { idUsuario: dto.idUsuarioMiembro, idEquipo: dto.idEquipo },
      {
        verificado: false,
        modificadoPorIdUsuario: idUsuarioActor,
        modificadoDesdeIp: direccionIp,
        modificadoEn: new Date(),
        origenModificacion: 'usuario',
      },
    );
  }
}
