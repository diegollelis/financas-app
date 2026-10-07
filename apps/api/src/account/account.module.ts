import { Module } from '@nestjs/common';
import { AccountController } from './account.controller.js';
import { DataExportService } from './data-export.service.js';

@Module({
  controllers: [AccountController],
  providers: [DataExportService],
})
export class AccountModule {}
