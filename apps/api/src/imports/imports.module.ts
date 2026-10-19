import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/people.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [PeopleModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
