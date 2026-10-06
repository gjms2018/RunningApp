import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ScopePermissionGuard } from '../../auth/guards/scope-permission.guard';
import { RequiereRol } from '../../auth/decorators/requiere-rol.decorator';
import { ResultadosMasivosService } from './resultados-masivos.service';

const TIPOS_MIME_PERMITIDOS = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024; // 5 MB — de sobra para una planilla de resultados

/**
 * Mismo guard de alcance que cargarResultado y finalizar: solo el
 * organizador dueño de ESTA carrera puede subir resultados masivos.
 * JwtAuthGuard no se repite (global vía APP_GUARD, ver AppModule).
 */
@Controller('carreras')
@UseGuards(ScopePermissionGuard)
export class ResultadosMasivosController {
  constructor(private resultadosMasivosService: ResultadosMasivosService) {}

  /**
   * NO escribe nada en la base de datos. Devuelve, fila por fila, si
   * hace match con una inscripción real y pasa las validaciones de
   * formato, o el motivo exacto del error — para que el organizador
   * corrija su archivo (o decida seguir adelante, ya que confirmar()
   * simplemente omite las filas con error).
   */
  @RequiereRol('organizador', { paramRecurso: 'idCarrera', resolucion: 'via_carrera' })
  @Post(':idCarrera/resultados/preview')
  @UseInterceptors(FileInterceptor('archivo'))
  async previsualizar(
    @Param('idCarrera') idCarrera: string,
    @UploadedFile() archivo: Express.Multer.File,
  ) {
    this.validarArchivo(archivo);
    return this.resultadosMasivosService.previsualizar(
      idCarrera,
      archivo.buffer,
      archivo.originalname,
    );
  }

  /**
   * Aplica el archivo: escribe SOLO las filas que validan correctamente
   * (mismas reglas que preview, reevaluadas en el momento — ver
   * ResultadosMasivosService.confirmar). Las filas con error no
   * bloquean al resto; quedan reportadas en el resumen de respuesta
   * para que el organizador las corrija en una carga posterior si
   * quiere completarlas.
   */
  @RequiereRol('organizador', { paramRecurso: 'idCarrera', resolucion: 'via_carrera' })
  @Post(':idCarrera/resultados/confirmar')
  @UseInterceptors(FileInterceptor('archivo'))
  async confirmar(
    @Param('idCarrera') idCarrera: string,
    @UploadedFile() archivo: Express.Multer.File,
  ) {
    this.validarArchivo(archivo);
    return this.resultadosMasivosService.confirmar(
      idCarrera,
      archivo.buffer,
      archivo.originalname,
    );
  }

  private validarArchivo(archivo: Express.Multer.File): void {
    if (!archivo) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    if (archivo.size > TAMANO_MAXIMO_BYTES) {
      throw new BadRequestException('El archivo supera el tamaño máximo de 5 MB');
    }
    const esExcelPorNombre = /\.xlsx?$/i.test(archivo.originalname);
    if (!esExcelPorNombre && !TIPOS_MIME_PERMITIDOS.includes(archivo.mimetype)) {
      throw new BadRequestException('Formato de archivo no soportado: usa CSV o Excel (.xlsx)');
    }
  }
}
