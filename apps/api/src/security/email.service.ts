import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import nodemailer from 'nodemailer';
import { CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { unseal } from './crypto';
import { z } from 'zod';
const messageSchema = z.object({ to: z.email(), subject: z.string(), text: z.string() });

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(EmailService.name);
  constructor(
    private readonly db: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  onModuleInit() {
    if (this.config.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.flush().catch(() => this.logger.warn('Email worker unavailable'));
    }, 3000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async flush() {
    if (this.running) return;
    this.running = true;
    try {
      for (let count = 0; count < 10; count++) {
        const job = await this.db.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM "EmailOutbox" WHERE "sentAt" IS NULL AND attempts < 5 AND "expiresAt" > NOW() AND "nextAttemptAt" <= NOW() AND ("claimedUntil" IS NULL OR "claimedUntil" < NOW()) ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
          if (!rows[0]) return null;
          return tx.emailOutbox.update({
            where: { id: rows[0].id },
            data: { attempts: { increment: 1 }, claimedUntil: new Date(Date.now() + 60000) },
          });
        });
        if (!job) break;
        try {
          const message = messageSchema.parse(
            JSON.parse(
              unseal(job.payload, this.config.ACCOUNT_SECURITY_KEY, `email:${job.userId}`),
            ),
          );
          if (this.config.EMAIL_PROVIDER === 'resend') {
            const response = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${this.config.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': job.id,
              },
              body: JSON.stringify({
                from: this.config.EMAIL_FROM,
                to: [message.to],
                subject: message.subject,
                text: message.text,
              }),
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw new Error('Provider rejected delivery');
          } else {
            const transport = nodemailer.createTransport({
              host: this.config.SMTP_HOST,
              port: this.config.SMTP_PORT,
              secure: this.config.SMTP_SECURE,
              requireTLS: this.config.NODE_ENV === 'production',
              auth: this.config.SMTP_USER
                ? { user: this.config.SMTP_USER, pass: this.config.SMTP_PASSWORD }
                : undefined,
              connectionTimeout: 10000,
              greetingTimeout: 10000,
              socketTimeout: 15000,
              logger: false,
              debug: false,
              disableFileAccess: true,
              disableUrlAccess: true,
            });
            try {
              await transport.sendMail({
                from: this.config.EMAIL_FROM,
                ...message,
                messageId: `<${job.id}@dineflow>`,
              });
            } finally {
              transport.close();
            }
          }
          await this.db.emailOutbox.update({
            where: { id: job.id },
            data: { sentAt: new Date(), claimedUntil: null, payload: '' },
          });
        } catch {
          // Never log provider responses, recipients, credentials or link payloads.
          this.logger.warn(`Email delivery deferred (${job.id})`);
          await this.db.emailOutbox.update({
            where: { id: job.id },
            data: {
              claimedUntil: null,
              nextAttemptAt: new Date(Date.now() + 15000 * 2 ** job.attempts),
            },
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
}
