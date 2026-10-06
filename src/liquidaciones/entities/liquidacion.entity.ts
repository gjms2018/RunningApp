import { Column, Entity, PrimaryColumn } from 'typeorm';

export type EstadoLiquidacion = 'pendiente' | 'transferido' | 'conciliado';

@Entity('liquidaciones')
export class Liquidacion {
  @PrimaryColumn({ name: 'id_liquidacion', type: 'uuid' })
  idLiquidacion: string;

  @Column({ name: 'id_carrera', type: 'uuid' })
  idCarrera: string;

  @Column({ name: 'id_organizador', type: 'uuid', nullable: true })
  idOrganizador: string | null;

  @Column({ name: 'id_patrocinador', type: 'uuid', nullable: true })
  idPatrocinador: string | null;

  @Column({ type: 'numeric' })
  monto: string;

  @Column({ type: 'enum', enum: ['pendiente', 'transferido', 'conciliado'] })
  estado: EstadoLiquidacion;

  @Column({ name: 'marcado_pagado_por_id_usuario', type: 'uuid', nullable: true })
  marcadoPagadoPorIdUsuario: string | null;

  @Column({ name: 'fecha_marcado_pagado', type: 'timestamptz', nullable: true })
  fechaMarcadoPagado: Date | null;

  @Column({ name: 'referencia_transferencia', type: 'varchar', nullable: true })
  referenciaTransferencia: string | null;
}
