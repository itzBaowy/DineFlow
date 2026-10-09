import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
type IoOptions = NonNullable<Parameters<IoAdapter['createIOServer']>[1]>;

export class RealtimeAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origin: string,
  ) {
    super(app);
  }
  override createIOServer(port: number, options?: IoOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origin, methods: ['GET', 'POST'], credentials: false },
    } as IoOptions);
  }
}
