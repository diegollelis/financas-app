import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule } from '@nestjs/config';
import { AccountModule } from './account/account.module.js';
import { PeopleModule } from './people/people.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BudgetModule } from './budget/budget.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { AppExceptionFilter } from './common/error-reporting.js';
import { validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { InvitationsModule } from './invitations/invitations.module.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SummaryModule } from './summary/summary.module.js';
import { AnalysisModule } from './analysis/analysis.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { InstallmentsModule } from './installments/installments.module.js';
import { RecurrencesModule } from './recurrences/recurrences.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    SentryModule.forRoot(),
    PrismaModule,
    MailModule,
    HealthModule,
    AuthModule,
    WorkspacesModule,
    InvitationsModule,
    CategoriesModule,
    TransactionsModule,
    BudgetModule,
    SummaryModule,
    AnalysisModule,
    RecurrencesModule,
    InstallmentsModule,
    ImportsModule,
    AccountModule,
    PeopleModule,
  ],
  // Reports unexpected errors to Sentry (a no-op without SENTRY_DSN), without query data (ADR 0034).
  providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }],
})
export class AppModule {}
