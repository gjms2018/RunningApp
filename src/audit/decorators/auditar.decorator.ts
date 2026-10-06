import { SetMetadata } from '@nestjs/common';

export type TablaAuditada =
  | 'inscripciones'
  | 'descuentos_inscripcion'
  | 'liquidaciones';

export const AUDITORIA_KEY = 'auditoriaMetadata';

export interface AuditoriaMetadata {
  tabla: TablaAuditada;
  /** Nombre del parámetro de ruta que identifica la fila afectada */
  paramId: string;
  operacion: 'crear' | 'modificar' | 'eliminar';
}

/**
 * Marca un endpoint como sujeto a auditoría tipo B (historial completo).
 * Solo se usa en las 3 tablas financieras/de resultado — el resto de
 * tablas usa auditoría tipo A (columnas simples), que se llena en el
 * propio servicio/repositorio sin necesidad de este interceptor.
 *
 * Ejemplo:
 *   @Auditar({ tabla: 'inscripciones', paramId: 'idInscripcion', operacion: 'modificar' })
 *   @Patch('inscripciones/:idInscripcion/resultado')
 *   cargarResultado(...) { ... }
 */
export const Auditar = (meta: AuditoriaMetadata) =>
  SetMetadata(AUDITORIA_KEY, meta);
