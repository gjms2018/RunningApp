import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('miembros_equipo')
export class MiembroEquipo {
  @PrimaryColumn({ name: 'id_usuario', type: 'uuid' })
  idUsuario: string;

  @PrimaryColumn({ name: 'id_equipo', type: 'uuid' })
  idEquipo: string;

  @Column({ name: 'es_principal', type: 'boolean', default: false })
  esPrincipal: boolean;

  @Column({ name: 'fecha_ingreso', type: 'timestamptz' })
  fechaIngreso: Date;

  // --- Verificación de identidad ---
  @Column({ type: 'boolean', default: false })
  verificado: boolean;

  @Column({ name: 'verificado_por_id_usuario', type: 'uuid', nullable: true })
  verificadoPorIdUsuario: string | null;

  @Column({ name: 'fecha_verificacion', type: 'timestamptz', nullable: true })
  fechaVerificacion: Date | null;

  // --- Auditoría tipo A ---
  @Column({ name: 'modificado_por_id_usuario', type: 'uuid', nullable: true })
  modificadoPorIdUsuario: string | null;

  @Column({ name: 'modificado_desde_ip', type: 'inet', nullable: true })
  modificadoDesdeIp: string | null;

  @Column({ name: 'modificado_en', type: 'timestamptz', nullable: true })
  modificadoEn: Date | null;

  @Column({ name: 'origen_modificacion', type: 'varchar', default: 'usuario' })
  origenModificacion: 'usuario' | 'sistema_automatico';
}
