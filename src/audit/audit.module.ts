import { Global, Module } from '@nestjs/common';
import { AuditoriaService } from './services/auditoria.service';
import { RequestContextService } from './services/request-context.service';
import { RequestContextInterceptor } from './services/request-context.interceptor';

/**
 * @Global(): AuditoriaService y RequestContextService los necesita
 * prácticamente cualquier servicio de negocio (cualquiera que escriba
 * en una tabla auditada o que necesite saber quién/desde dónde se hizo
 * la petición). Declararlo global evita reimportar este módulo en cada
 * feature module — se importa UNA vez en AppModule y queda disponible
 * en todos lados.
 *
 * RequestContextInterceptor también se declara aquí como provider (no
 * como controller ni service de negocio) para que AppModule pueda
 * registrarlo vía APP_INTERCEPTOR sin tener que reexportar su propia
 * clase desde otro lado.
 */
@Global()
@Module({
  providers: [AuditoriaService, RequestContextService, RequestContextInterceptor],
  exports: [AuditoriaService, RequestContextService, RequestContextInterceptor],
})
export class AuditModule {}
