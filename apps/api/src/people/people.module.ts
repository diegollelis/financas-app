import { Module } from '@nestjs/common';
import { PeopleController } from './people.controller.js';
import { PeopleService } from './people.service.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  controllers: [PeopleController],
  providers: [PeopleService, SettlementsService],
  // The import finds people by name, as the page shows them (members by their account's name).
  exports: [PeopleService],
})
export class PeopleModule {}
