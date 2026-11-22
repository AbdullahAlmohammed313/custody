import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './config/env';
import { setupSwagger } from './docs/swagger';

// Builds the configured app. Shared by main.ts and the end-to-end tests
export async function createApp() {
  // Better Auth reads the request body itself; the library re-adds the body parser for other routes
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.enableCors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await setupSwagger(app);
  return app;
}
