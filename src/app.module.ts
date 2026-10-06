import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AuditModule } from './audit/audit.module';
import { RequestContextInterceptor } from './audit/services/request-context.interceptor';
import { AuthorizationModule } from './auth/authorization.module';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { EquiposModule } from './equipos/equipos.module';
import { CarrerasModule } from './carreras/carreras.module';
import { InscripcionesModule } from './inscripciones/inscripciones.module';
import { HistorialModule } from './historial/historial.module';
import { LiquidacionesModule } from './liquidaciones/liquidaciones.module';
import { OrganizadoresModule } from './organizadores/organizadores.module';
import { PatrocinadoresModule } from './patrocinadores/patrocinadores.module';
import { Usuario } from './usuarios/entities/usuario.entity';
import { Carrera } from './carreras/entities/carrera.entity';
import { MiembroEquipo } from './equipos/entities/miembro-equipo.entity';
import { Liquidacion } from './liquidaciones/entities/liquidacion.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // synchronize: false a propósito — el esquema real vive en
    // schema.sql (ver el DDL consolidado) y se aplica por fuera de la
    // app, con control de versión explícito. Dejar que TypeORM
    // sincronice el esquema automáticamente en un sistema con
    // CHECK constraints, índices parciales y triggers de negocio tan
    // específicos como los de este proyecto es arriesgado — TypeORM no
    // sabe recrear esas piezas de forma confiable.
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.getOrThrow<string>('DB_USERNAME'),
        password: configService.getOrThrow<string>('DB_PASSWORD'),
        database: configService.getOrThrow<string>('DB_NAME'),
        entities: [Usuario, Carrera, MiembroEquipo, Liquidacion],
        synchronize: false,
      }),
    }),

    // Módulos globales (@Global()): se importan UNA vez aquí y sus
    // providers quedan disponibles en cualquier otro módulo sin
    // volver a importarlos.
    AuditModule,
    AuthorizationModule,

    // Módulos de dominio
    AuthModule,
    UsuariosModule,
    EquiposModule,
    CarrerasModule,
    InscripcionesModule,
    HistorialModule,
    LiquidacionesModule,
    OrganizadoresModule,
    PatrocinadoresModule,
  ],
  providers: [
    /**
     * ORDEN DE EJECUCIÓN REAL EN NESTJS (de afuera hacia adentro):
     * Middleware -> Guards -> Interceptors (antes del handler) -> Pipes
     * -> Controller -> Interceptors (después del handler).
     *
     * Por eso JwtAuthGuard (guard) va antes que RequestContextInterceptor
     * (interceptor) en este pipeline, aunque ambos estén "globales":
     * para cuando el interceptor lee `request.user`, el guard ya
     * corrió y ya lo pobló (o ya rechazó la petición con 401 si el
     * token era inválido, en cuyo caso el interceptor ni se ejecuta).
     */
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // global: toda ruta requiere JWT salvo @Public()
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
    // ScopePermissionGuard NO se registra aquí como global — se aplica
    // explícitamente vía @UseGuards(ScopePermissionGuard) solo en los
    // endpoints que llevan @RequiereRol (ver AuthorizationModule, que
    // sí lo deja disponible para inyección en cualquier controller).
  ],
})
export class AppModule {}
