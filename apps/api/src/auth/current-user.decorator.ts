import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './session.guard.js';

/** The session of the request, e.g. to mark "Este aparelho". Only behind `SessionGuard`. */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth.session,
);

/** The signed-in user. Only valid on routes protected by `SessionGuard`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth.user,
);
