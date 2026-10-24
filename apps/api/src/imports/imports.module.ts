import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/people.module.js';
import { RecurrencesModule } from '../recurrences/recurrences.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [PeopleModule, RecurrencesModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
