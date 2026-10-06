import { Module } from '@nestjs/common';
import { RecurrencesController } from './recurrences.controller.js';
import { RecurrencesService } from './recurrences.service.js';

/** Exports the service: opening a month (transactions, analysis) generates the recurrences. */
@Module({
  controllers: [RecurrencesController],
  providers: [RecurrencesService],
  exports: [RecurrencesService],
})
export class RecurrencesModule {}
