import { Module } from '@nestjs/common';
import { BudgetModule } from '../budget/budget.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { SummaryController } from './summary.controller.js';
import { SummaryService } from './summary.service.js';

@Module({
  imports: [TransactionsModule, BudgetModule],
  controllers: [SummaryController],
  providers: [SummaryService],
})
export class SummaryModule {}
