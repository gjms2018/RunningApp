import { Column, Entity, PrimaryColumn } from 'typeorm';

export type EstadoEvento = 'programada' | 'finalizada' | 'cancelada';

@Entity('carreras')
export class Carrera {
  @PrimaryColumn({ name: 'id_carrera', type: 'uuid' })
  idCarrera: string;

  @Column({ name: 'id_organizador', type: 'uuid' })
  idOrganizador: string;

  @Column({ name: 'nombre_evento', type: 'varchar' })
  nombreEvento: string;

  @Column({ name: 'fecha_evento', type: 'timestamptz' })
  fechaEvento: Date;

  @Column({ name: 'distancia_km', type: 'numeric' })
  distanciaKm: string;

  @Column({ name: 'distancia_requerida_km', type: 'numeric', default: 0 })
  distanciaRequeridaKm: string;

  @Column({ name: 'cupo_maximo', type: 'int' })
  cupoMaximo: number;

  @Column({ name: 'cupos_disponibles', type: 'int' })
  cuposDisponibles: number;

  @Column({ name: 'costo_inscripcion', type: 'numeric' })
  costoInscripcion: string;

  @Column({ name: 'estado_evento', type: 'enum', enum: ['programada', 'finalizada', 'cancelada'] })
  estadoEvento: EstadoEvento;
}
