import { Module } from '@nestjs/common';
import { BudgetController } from './budget.controller.js';
import { BudgetService } from './budget.service.js';

@Module({
  controllers: [BudgetController],
  providers: [BudgetService],
})
export class BudgetModule {}
