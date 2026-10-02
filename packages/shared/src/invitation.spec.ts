import { describe, expect, it } from 'vitest';
import { createInvitationInputSchema } from './invitation.ts';

describe('createInvitationInputSchema', () => {
  it('lowercases the e-mail', () => {
    expect(
      createInvitationInputSchema.parse({ email: 'Joao@Example.com', role: 'EDITOR' }),
    ).toEqual({
      email: 'joao@example.com',
      role: 'EDITOR',
    });
  });

  it('never invites as OWNER', () => {
    expect(
      createInvitationInputSchema.safeParse({ email: 'joao@example.com', role: 'OWNER' }).success,
    ).toBe(false);
  });

  it('explains an invalid e-mail in pt-BR', () => {
    const result = createInvitationInputSchema.safeParse({ email: 'joao', role: 'VIEWER' });
    expect(result.error?.issues[0]?.message).toBe('Informe um e-mail válido.');
  });
});
