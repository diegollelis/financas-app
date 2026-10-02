import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { Mailer } from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { AUTH, createAuth } from './auth.js';
import { MeController } from './me.controller.js';
import { SessionGuard } from './session.guard.js';

// Global: every business module protects its routes with SessionGuard without importing this one
// (importing it back from WorkspacesModule would be a circular dependency).
@Global()
@Module({
  imports: [WorkspacesModule],
  controllers: [MeController],
  providers: [
    {
      provide: AUTH,
      inject: [PrismaService, ConfigService, Mailer, WorkspacesService],
      useFactory: (
        prisma: PrismaService,
        config: ConfigService<Env, true>,
        mailer: Mailer,
        workspaces: WorkspacesService,
      ) =>
        createAuth(
          prisma,
          {
            BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET', { infer: true }),
            BETTER_AUTH_URL: config.get('BETTER_AUTH_URL', { infer: true }),
            WEB_ORIGIN: config.get('WEB_ORIGIN', { infer: true }),
            GOOGLE_CLIENT_ID: config.get('GOOGLE_CLIENT_ID', { infer: true }),
            GOOGLE_CLIENT_SECRET: config.get('GOOGLE_CLIENT_SECRET', { infer: true }),
          },
          mailer,
          (userId) => workspaces.ensurePersonalWorkspace(userId),
        ),
    },
    SessionGuard,
  ],
  exports: [AUTH, SessionGuard],
})
export class AuthModule {}
