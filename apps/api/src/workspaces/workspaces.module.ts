import { Module } from '@nestjs/common';
import { WorkspaceMemberGuard } from './workspace-member.guard.js';
import { WorkspaceController } from './workspace.controller.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  controllers: [WorkspacesController, WorkspaceController],
  providers: [WorkspacesService, WorkspaceMemberGuard],
  exports: [WorkspacesService, WorkspaceMemberGuard],
})
export class WorkspacesModule {}
