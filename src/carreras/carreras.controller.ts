import {
  Body,
  Controller,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ScopePermissionGuard } from '../auth/guards/scope-permission.guard';
import { RequiereRol } from '../auth/decorators/requiere-rol.decorator';
import { CargarResultadoService } from './cargar-resultado.service';
import { CierreCarreraService } from './cierre-carrera.service';

class CargarResultadoBodyDto {
  tiempoOficial: string;
  estadoCarrera: 'finalizado' | 'dnf' | 'dns';
}

/**
 * JwtAuthGuard no se repite aquí: está registrado globalmente vía
 * APP_GUARD (ver AppModule). Solo se agrega el guard de alcance.
 */
@Controller('carreras')
@UseGuards(ScopePermissionGuard)
export class CarrerasController {
  constructor(
    private cargarResultadoService: CargarResultadoService,
    private cierreCarreraService: CierreCarreraService,
  ) {}

  /**
   * Solo puede ejecutar esto un usuario con asignación 'organizador'
   * cuyo id_organizador coincida con el id_organizador REAL de
   * :idCarrera (resuelto vía RecursoResolverService.obtenerOrganizadorDeCarrera).
   *
   * Un Organizador de OTRA carrera recibe 403, aunque también tenga
   * el rol 'organizador' en general.
   */
  @RequiereRol('organizador', {
    paramRecurso: 'idCarrera',
    resolucion: 'via_carrera',
  })
  @Patch(':idCarrera/inscripciones/:idInscripcion/resultado')
  async cargarResultado(
    @Param('idCarrera') idCarrera: string,
    @Param('idInscripcion') idInscripcion: string,
    @Body() body: CargarResultadoBodyDto,
  ) {
    await this.cargarResultadoService.ejecutar({
      idInscripcion,
      tiempoOficial: body.tiempoOficial,
      estadoCarrera: body.estadoCarrera,
    });

    return { mensaje: 'Resultado cargado correctamente' };
  }

  /**
   * Cierra la carrera y dispara la generación automática de
   * liquidaciones (una para el organizador, una por cada patrocinador
   * que financió descuentos). Requiere que todos los inscritos tengan
   * ya un resultado cargado (ver CierreCarreraService).
   *
   * Mismo alcance que cargarResultado: solo el organizador dueño de
   * ESTA carrera puede finalizarla.
   */
  @RequiereRol('organizador', {
    paramRecurso: 'idCarrera',
    resolucion: 'via_carrera',
  })
  @Patch(':idCarrera/finalizar')
  async finalizar(@Param('idCarrera') idCarrera: string) {
    await this.cierreCarreraService.finalizar({ idCarrera });

    return {
      mensaje:
        'Carrera finalizada. Las liquidaciones fueron generadas y quedan en estado pendiente.',
    };
  }
}
