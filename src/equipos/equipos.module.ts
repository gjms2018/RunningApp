import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MiembroEquipo } from './entities/miembro-equipo.entity';
import { EquiposController } from './equipos.controller';
import { EquiposService } from './equipos.service';
import { MiembrosEquipoController } from './miembros-equipo.controller';
import { VerificacionMiembroService } from './verificacion-miembro.service';

@Module({
  imports: [TypeOrmModule.forFeature([MiembroEquipo])],
  controllers: [EquiposController, MiembrosEquipoController],
  providers: [EquiposService, VerificacionMiembroService],
})
export class EquiposModule {}
