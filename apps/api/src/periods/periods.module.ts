import { Module } from '@nestjs/common';
import { RecurrencesModule } from '../recurrences/recurrences.module.js';
import { PeriodsController } from './periods.controller.js';
import { PeriodsService } from './periods.service.js';

/** Fechamento do mês (ADR 0063). */
@Module({
  imports: [RecurrencesModule],
  controllers: [PeriodsController],
  providers: [PeriodsService],
})
export class PeriodsModule {}
