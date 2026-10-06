import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Carrera } from './entities/carrera.entity';
import { CarrerasController } from './carreras.controller';
import { CrearCarreraController } from './crear-carrera.controller';
import { CrearCarreraService } from './crear-carrera.service';
import { CargarResultadoService } from './cargar-resultado.service';
import { CierreCarreraService } from './cierre-carrera.service';
import { ResultadosMasivosController } from './resultados-masivos/resultados-masivos.controller';
import { ResultadosMasivosService } from './resultados-masivos/resultados-masivos.service';
import { ParseadorResultadosService } from './resultados-masivos/parseador-resultados.service';
import { ValidadorFilasResultadoService } from './resultados-masivos/validador-filas-resultado.service';

@Module({
  imports: [TypeOrmModule.forFeature([Carrera])],
  controllers: [CarrerasController, CrearCarreraController, ResultadosMasivosController],
  providers: [
    CrearCarreraService,
    CargarResultadoService,
    CierreCarreraService,
    ResultadosMasivosService,
    ParseadorResultadosService,
    ValidadorFilasResultadoService,
  ],
})
export class CarrerasModule {}
