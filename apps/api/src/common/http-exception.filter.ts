import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const payload = error instanceof HttpException ? error.getResponse() : null;
    const detail = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {};
    if (status >= 500) this.logger.error({ requestId: request.headers['x-request-id'], method: request.method, path: request.path, error: error instanceof Error ? error.message : 'Unknown error' });
    response.status(status).json({
      statusCode: status,
      message: typeof payload === 'string' ? payload : detail.message ?? 'Hệ thống đang gặp sự cố, vui lòng thử lại',
      ...(detail.issues ? { issues: detail.issues } : {}),
      requestId: response.getHeader('X-Request-Id'),
    });
  }
}
