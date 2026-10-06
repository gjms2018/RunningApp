import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Carrera } from '../../carreras/entities/carrera.entity';
import { MiembroEquipo } from '../../equipos/entities/miembro-equipo.entity';
import { Liquidacion } from '../../liquidaciones/entities/liquidacion.entity';

/**
 * Centraliza las consultas que el guard necesita para saber a quién
 * pertenece REALMENTE un recurso, antes de comparar contra el alcance
 * del usuario autenticado. Vive separado del guard para poder testearlo
 * con mocks sin tener que instanciar todo el pipeline de NestJS.
 */
@Injectable()
export class RecursoResolverService {
  constructor(
    @InjectRepository(Carrera)
    private carrerasRepo: Repository<Carrera>,
    @InjectRepository(MiembroEquipo)
    private miembrosEquipoRepo: Repository<MiembroEquipo>,
    @InjectRepository(Liquidacion)
    private liquidacionesRepo: Repository<Liquidacion>,
  ) {}

  /** Dado un id_carrera, devuelve su id_organizador real. */
  async obtenerOrganizadorDeCarrera(idCarrera: string): Promise<string | null> {
    const carrera = await this.carrerasRepo.findOne({
      where: { idCarrera },
      select: ['idOrganizador'],
    });
    return carrera?.idOrganizador ?? null;
  }

  /**
   * Dado el id de una fila de miembros_equipo (o el idUsuario del miembro
   * cuando la ruta usa ese identificador), devuelve el id_equipo al que
   * pertenece, para validar que quien verifica sea representante de ESE
   * equipo y no de otro.
   */
  async obtenerEquipoDeRecurso(idUsuarioMiembro: string): Promise<string | null> {
    const membresia = await this.miembrosEquipoRepo.findOne({
      where: { idUsuario: idUsuarioMiembro },
      select: ['idEquipo'],
    });
    return membresia?.idEquipo ?? null;
  }

  /**
   * Dado un id_liquidacion cuyo tipo es 'patrocinador', devuelve el
   * id_patrocinador dueño — usado para autorizar el paso "marcar
   * transferido" (solo el patrocinador que debe pagar puede hacerlo).
   */
  async obtenerPatrocinadorDeLiquidacion(
    idLiquidacion: string,
  ): Promise<string | null> {
    const liquidacion = await this.liquidacionesRepo.findOne({
      where: { idLiquidacion },
      select: ['idPatrocinador'],
    });
    return liquidacion?.idPatrocinador ?? null;
  }

  /**
   * Dado un id_liquidacion, devuelve el id_organizador que debe
   * confirmarla como recibida (aplica tanto si la liquidación es del
   * propio organizador como si es de un patrocinador — en ambos casos
   * quien concilia como "recibido" es el organizador de la carrera).
   */
  async obtenerOrganizadorDeLiquidacion(
    idLiquidacion: string,
  ): Promise<string | null> {
    const liquidacion = await this.liquidacionesRepo.findOne({
      where: { idLiquidacion },
      select: ['idOrganizador', 'idCarrera'],
    });

    if (!liquidacion) {
      return null;
    }

    // Liquidación propia del organizador: el dueño ya está en la fila.
    if (liquidacion.idOrganizador) {
      return liquidacion.idOrganizador;
    }

    // Liquidación de un patrocinador: el receptor es el organizador
    // de la carrera asociada, no está en la fila de liquidaciones directamente.
    return this.obtenerOrganizadorDeCarrera(liquidacion.idCarrera);
  }
}

