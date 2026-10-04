import type { ErrorEvent } from '@sentry/nestjs';
import { describe, expect, it } from 'vitest';
import { redactPrismaError, scrubApiEvent } from './error-reporting.js';

// Fictitious data only (ADR 0019).
describe('scrubApiEvent', () => {
  it('replaces Prisma messages, which may repeat query arguments, with the error code', () => {
    const event: ErrorEvent = {
      type: undefined,
      exception: {
        values: [
          {
            type: 'PrismaClientKnownRequestError',
            value:
              'Invalid `prisma.transaction.create()`: description: "Aluguel", amountCents: 150000',
          },
        ],
      },
    };

    const scrubbed = scrubApiEvent(event, { originalException: { code: 'P2002' } });

    expect(scrubbed.exception?.values?.[0]?.value).toBe(
      'Mensagem omitida: pode conter dados da consulta (P2002)',
    );
    expect(JSON.stringify(scrubbed)).not.toContain('Aluguel');
  });

  it('keeps other messages and still applies the shared scrubbing', () => {
    const event: ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: 'TypeError', value: 'x is not a function' }] },
      request: { url: 'https://app.example.com/api/invitations/abc123', data: '{"a":1}' },
    };

    const scrubbed = scrubApiEvent(event, {});

    expect(scrubbed.exception?.values?.[0]?.value).toBe('x is not a function');
    expect(scrubbed.request).toEqual({ url: 'https://app.example.com/api/invitations/[token]' });
  });
});

describe('redactPrismaError', () => {
  it('replaces the message and its copy in the stack, keeping the code', () => {
    const error = Object.assign(new Error('Invalid call: description: "Aluguel"'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    });

    redactPrismaError(error);

    expect(error.message).toBe('Mensagem omitida: pode conter dados da consulta (P2002)');
    expect(error.stack).not.toContain('Aluguel');
  });

  it('leaves other errors alone', () => {
    const error = new Error('x is not a function');

    redactPrismaError(error);

    expect(error.message).toBe('x is not a function');
  });
});
