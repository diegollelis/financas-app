import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { AUTH, type Auth, type AuthSession } from './auth.js';

export interface AuthenticatedRequest extends Request {
  auth: AuthSession;
}

/**
 * Lets the request through only with a valid session cookie, and attaches the user and the
 * session to it (read them with `@CurrentUser()`). Without a session: 401.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedException();

    request.auth = session;
    return true;
  }
}
