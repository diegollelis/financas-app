import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { WorkspaceInvitationsController } from './workspace-invitations.controller.js';

@Module({
  controllers: [WorkspaceInvitationsController, InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
