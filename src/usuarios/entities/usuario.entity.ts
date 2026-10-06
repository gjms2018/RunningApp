import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('usuarios')
export class Usuario {
  @PrimaryColumn({ name: 'id_usuario', type: 'uuid' })
  idUsuario: string;

  @Column({ type: 'varchar' })
  nombre: string;

  // Nullable: NULL en cuentas de menor gestionadas por un tutor
  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string | null;

  @Column({ name: 'dni_pasaporte', type: 'varchar', nullable: true })
  dniPasaporte: string | null;

  @Column({ name: 'fecha_nacimiento', type: 'date' })
  fechaNacimiento: string;

  // Autoreferencia a la cuenta autogestionada del adulto responsable.
  // NULL si esta propia fila YA ES una cuenta autogestionada.
  @Column({ name: 'id_tutor', type: 'uuid', nullable: true })
  idTutor: string | null;

  @Column({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @Column({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}

