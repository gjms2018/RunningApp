import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      // Sin esto, los decoradores de class-validator en cada DTO
      // (RegistrarUsuarioDto, CrearMenorDto, etc.) NUNCA se ejecutan —
      // es la pieza que faltaba para que toda esa validación declarativa
      // realmente tenga efecto en runtime.
      whitelist: true, // descarta silenciosamente propiedades no declaradas en el DTO
      forbidNonWhitelisted: true, // en vez de descartarlas, rechaza la petición con 400
      transform: true, // convierte el body plano en una instancia real de la clase DTO
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS: en Fase 1 (RunSquad + frontend propio) basta con permitir el
  // origen del frontend vía variable de entorno. Al abrir la
  // plataforma a más organizadores en Fase 2, esto probablemente
  // necesite una lista de orígenes en vez de uno solo.
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });

  const puerto = process.env.PORT ?? 3000;
  await app.listen(puerto);
}

bootstrap();
