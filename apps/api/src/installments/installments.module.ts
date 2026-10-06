import { Module } from '@nestjs/common';
import { InstallmentsController } from './installments.controller.js';
import { InstallmentsService } from './installments.service.js';

@Module({
  controllers: [InstallmentsController],
  providers: [InstallmentsService],
})
export class InstallmentsModule {}
