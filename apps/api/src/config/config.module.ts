import { Global, Module } from '@nestjs/common';
import { CONFIG, loadEnv } from './env';

@Global()
@Module({ providers: [{ provide: CONFIG, useFactory: loadEnv }], exports: [CONFIG] })
export class ConfigModule {}
