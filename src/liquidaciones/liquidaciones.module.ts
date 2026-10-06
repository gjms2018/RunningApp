import { Module } from '@nestjs/common';
import { LiquidacionesController } from './liquidaciones.controller';
import { LiquidacionesService } from './liquidaciones.service';
import { EstadoCuentaController } from './estado-cuenta.controller';
import { EstadoCuentaService } from './estado-cuenta.service';
import { ReportesPatrocinadorController } from './reportes-patrocinador.controller';
import { ReportesPatrocinadorService } from './reportes-patrocinador.service';

@Module({
  controllers: [
    LiquidacionesController,
    EstadoCuentaController,
    ReportesPatrocinadorController,
  ],
  providers: [LiquidacionesService, EstadoCuentaService, ReportesPatrocinadorService],
})
export class LiquidacionesModule {}
