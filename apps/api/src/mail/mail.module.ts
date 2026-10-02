import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { Mailer, MailpitMailer, ResendMailer } from './mailer.js';

@Global()
@Module({
  providers: [
    {
      provide: Mailer,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Mailer => {
        const from = {
          email: config.get('MAIL_FROM_EMAIL', { infer: true }),
          name: config.get('MAIL_FROM_NAME', { infer: true }),
        };
        const apiKey = config.get('RESEND_API_KEY', { infer: true });
        // env.ts guarantees the key exists when the transport is resend.
        return config.get('MAIL_TRANSPORT', { infer: true }) === 'resend' && apiKey
          ? new ResendMailer(apiKey, from)
          : new MailpitMailer(config.get('MAILPIT_URL', { infer: true }), from);
      },
    },
  ],
  exports: [Mailer],
})
export class MailModule {}
