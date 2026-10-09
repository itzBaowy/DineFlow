import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { AccountService } from './account.service';
@Module({ providers: [EmailService, AccountService], exports: [EmailService, AccountService] })
export class SecurityModule {}
