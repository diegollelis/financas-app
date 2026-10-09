import { Module } from '@nestjs/common';
import { BudgetDestinationsController } from './budget-destinations.controller.js';
import { BudgetDestinationsService } from './budget-destinations.service.js';

@Module({
  controllers: [BudgetDestinationsController],
  providers: [BudgetDestinationsService],
})
export class BudgetDestinationsModule {}
