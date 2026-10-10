import { Module } from '@nestjs/common';
import { AccountDeletionService } from './account-deletion.service.js';
import { AccountSecurityService } from './account-security.service.js';
import { AccountController } from './account.controller.js';
import { DataExportService } from './data-export.service.js';

@Module({
  controllers: [AccountController],
  providers: [DataExportService, AccountDeletionService, AccountSecurityService],
  // Better Auth (AuthModule) runs the deletion checks.
  exports: [AccountDeletionService],
})
export class AccountModule {}
