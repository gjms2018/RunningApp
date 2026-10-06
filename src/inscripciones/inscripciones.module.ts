import { Module } from '@nestjs/common';
import { InscripcionesController } from './inscripciones.controller';
import { InscripcionesService } from './inscripciones.service';
import { ValidacionHistorialService } from './validacion-historial.service';
import { AutoridadCorredorService } from './autoridad-corredor.service';

@Module({
  controllers: [InscripcionesController],
  providers: [InscripcionesService, ValidacionHistorialService, AutoridadCorredorService],
  // Se exporta porque HistorialModule también la necesita — vive aquí
  // por cercanía histórica con InscripcionesController (donde se creó
  // originalmente), no porque sea conceptualmente exclusiva de este módulo.
  exports: [AutoridadCorredorService],
})
export class InscripcionesModule {}
