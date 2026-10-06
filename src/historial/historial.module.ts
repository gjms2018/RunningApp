import { Module } from '@nestjs/common';
import { HistorialController } from './historial.controller';
import { HistorialService } from './historial.service';
import { InscripcionesModule } from '../inscripciones/inscripciones.module';

@Module({
  // Importa InscripcionesModule solo para reutilizar AutoridadCorredorService
  // (exportado desde ahí) sin duplicar la lógica de autorización.
  imports: [InscripcionesModule],
  controllers: [HistorialController],
  providers: [HistorialService],
})
export class HistorialModule {}
