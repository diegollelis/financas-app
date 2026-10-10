import type { AccountSecurity } from '@financas/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { describeUserAgent } from './user-agent.js';

/**
 * What "Minha conta" shows about how the account is protected (ADR 0049): whether it has a
 * password, and the devices it is signed in on. Never a session's token or IP: Better Auth's own
 * /list-sessions returns the tokens, so the page reads this instead.
 */
@Injectable()
export class AccountSecurityService {
  constructor(private readonly prisma: PrismaService) {}

  async describe(userId: string, currentSessionId: string): Promise<AccountSecurity> {
    const [password, sessions] = await Promise.all([
      this.prisma.account.findFirst({
        where: { userId, providerId: 'credential', password: { not: null } },
        select: { id: true },
      }),
      this.prisma.session.findMany({
        where: { userId, expiresAt: { gt: new Date() } },
        select: { id: true, userAgent: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const described = sessions.map((session) => ({
      id: session.id,
      ...describeUserAgent(session.userAgent),
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.updatedAt.toISOString(),
      current: session.id === currentSessionId,
    }));
    return {
      hasPassword: password !== null,
      // "Este aparelho" first, then the most recently used.
      sessions: [
        ...described.filter((session) => session.current),
        ...described.filter((session) => !session.current),
      ],
    };
  }
}
