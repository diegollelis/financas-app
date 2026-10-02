import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { Mailer } from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AUTH, createAuth } from './auth.js';
import { MeController } from './me.controller.js';
import { SessionGuard } from './session.guard.js';

@Module({
  controllers: [MeController],
  providers: [
    {
      provide: AUTH,
      inject: [PrismaService, ConfigService, Mailer],
      useFactory: (prisma: PrismaService, config: ConfigService<Env, true>, mailer: Mailer) =>
        createAuth(
          prisma,
          {
            BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET', { infer: true }),
            BETTER_AUTH_URL: config.get('BETTER_AUTH_URL', { infer: true }),
            WEB_ORIGIN: config.get('WEB_ORIGIN', { infer: true }),
          },
          mailer,
        ),
    },
    SessionGuard,
  ],
  exports: [AUTH, SessionGuard],
})
export class AuthModule {}
