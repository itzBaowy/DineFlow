import { Inject } from '@nestjs/common';
import { WebSocketGateway, type OnGatewayInit } from '@nestjs/websockets';
import type { Server } from 'socket.io';
import { realtimePath } from '@dineflow/shared';
import { CONFIG, type AppConfig } from '../config/env';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({
  path: realtimePath,
  addTrailingSlash: false,
  maxHttpBufferSize: 16384,
  connectTimeout: 10000,
  serveClient: false,
})
export class RealtimeGateway implements OnGatewayInit {
  constructor(
    private readonly realtime: RealtimeService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  afterInit(server: Server) {
    // Same-origin polling GETs may omit Origin. Authorization uses a single-use ticket,
    // never the cookies on the socket handshake; cross-site browser requests stay rejected.
    server.engine.opts.allowRequest = (request, callback) =>
      callback(
        null,
        (!request.headers.origin || request.headers.origin === this.config.APP_ORIGIN) &&
          request.headers['sec-fetch-site'] !== 'cross-site',
      );
    server.engine.on('headers', (headers) => {
      headers['Cache-Control'] = 'no-store';
    });
    server.use((socket, next) => {
      if (
        (socket.handshake.headers.origin &&
          socket.handshake.headers.origin !== this.config.APP_ORIGIN) ||
        socket.handshake.headers['sec-fetch-site'] === 'cross-site'
      ) {
        next(new Error('AUTH_REQUIRED'));
        return;
      }
      void this.realtime
        .consume((socket.handshake.auth as Record<string, unknown>).ticket)
        .then((identity) => {
          socket.data.identity = identity;
          next();
        })
        .catch(() => next(new Error('AUTH_REQUIRED')));
    });
    server.on('connection', (socket) => this.realtime.register(socket, socket.data.identity));
    this.realtime.attach(server);
  }
}
