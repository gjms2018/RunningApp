import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Carrera } from '../carreras/entities/carrera.entity';
import { MiembroEquipo } from '../equipos/entities/miembro-equipo.entity';
import { Liquidacion } from '../liquidaciones/entities/liquidacion.entity';
import { ScopePermissionGuard } from './guards/scope-permission.guard';
import { RecursoResolverService } from './guards/recurso-resolver.service';

/**
 * @Global(): ScopePermissionGuard se usa vía @UseGuards(ScopePermissionGuard)
 * en prácticamente todos los controllers de la app (carreras, equipos,
 * liquidaciones, organizadores, patrocinadores...). Declararlo global
 * evita que cada feature module tenga que importar este módulo por
 * separado solo para poder resolver esa clase en su propio contexto de
 * inyección de dependencias.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Carrera, MiembroEquipo, Liquidacion])],
  providers: [RecursoResolverService, ScopePermissionGuard],
  exports: [RecursoResolverService, ScopePermissionGuard],
})
export class AuthorizationModule {}
