import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const parserType = error instanceof Error && 'type' in error ? error.type : undefined;
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : parserType === 'entity.too.large'
          ? 413
          : parserType === 'entity.parse.failed'
            ? 400
            : 500;
    const payload =
      error instanceof HttpException
        ? error.getResponse()
        : status === 413
          ? 'Yêu cầu vượt giới hạn 128 KB'
          : status === 400
            ? 'Nội dung JSON không hợp lệ'
            : null;
    const detail =
      typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
    if (status >= 500)
      this.logger.error({
        requestId: request.headers['x-request-id'],
        method: request.method,
        path: request.path,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    response.status(status).json({
      statusCode: status,
      message:
        typeof payload === 'string'
          ? payload
          : (detail.message ?? 'Hệ thống đang gặp sự cố, vui lòng thử lại'),
      ...(detail.issues ? { issues: detail.issues } : {}),
      requestId: response.getHeader('X-Request-Id'),
    });
  }
}
