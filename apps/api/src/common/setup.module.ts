import { Global, Module } from '@nestjs/common';
import { SetupMutationService } from './setup-mutation.service';
@Global()
@Module({ providers: [SetupMutationService], exports: [SetupMutationService] })
export class SetupModule {}
