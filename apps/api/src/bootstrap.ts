import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { CONFIG, type AppConfig } from './config/env';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RealtimeAdapter } from './realtime/realtime.adapter';

export async function createApp(logger: false | undefined = undefined) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
    bodyParser: false,
  });
  const config = app.get<AppConfig>(CONFIG);
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.useWebSocketAdapter(new RealtimeAdapter(app, config.APP_ORIGIN));
  // Protected QR images are loaded directly by the sibling web subdomain.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    request.headers['x-request-id'] = randomUUID();
    response.setHeader('X-Request-Id', request.headers['x-request-id']);
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.useBodyParser('json', { limit: '128kb' });
  app.use(cookieParser());
  app.enableCors({
    origin: config.APP_ORIGIN,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-DineFlow-Client', 'X-DineFlow-Restaurant'],
    exposedHeaders: ['X-DineFlow-Scope-Mismatch', 'X-Request-Id'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  if (config.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('DineFlow API')
        .setDescription(
          'Staff auth and administration, setup, ordering, kitchen, realtime, billing, receipts and scoped analytics',
        )
        .setVersion('0.7.0')
        .addCookieAuth('df_access')
        .addCookieAuth('df_guest')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { withCredentials: true },
    });
  }
  app.enableShutdownHooks();
  return app;
}
