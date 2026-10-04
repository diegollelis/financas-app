import { describe, expect, it } from 'vitest';
import { redactUrl, scrubReportedEvent } from './error-reporting.ts';

// Fictitious tokens and data only (ADR 0019).
describe('redactUrl', () => {
  it.each([
    [
      'https://app.example.com/redefinir-senha?token=abc123',
      'https://app.example.com/redefinir-senha',
    ],
    [
      'https://app.example.com/api/auth/verify-email?token=abc&callbackURL=x',
      'https://app.example.com/api/auth/verify-email',
    ],
    ['https://app.example.com/convites/abc123', 'https://app.example.com/convites/[token]'],
    ['/api/invitations/abc123/accept', '/api/invitations/[token]/accept'],
    ['/api/auth/reset-password/abc123?callbackURL=x', '/api/auth/reset-password/[token]'],
    ['/espacos/0192-uuid/painel#topo', '/espacos/0192-uuid/painel'],
  ])('%s → %s', (url, expected) => {
    expect(redactUrl(url)).toBe(expected);
  });
});

describe('scrubReportedEvent', () => {
  it('keeps only the redacted URL of the request and drops the user', () => {
    const event = scrubReportedEvent({
      request: {
        url: 'https://app.example.com/api/invitations/abc123',
        data: { description: 'Aluguel', amountCents: 150000 },
        cookies: { session: 'segredo' },
        headers: { cookie: 'session=segredo' },
        query_string: 'token=abc',
      },
      user: { email: 'maria@example.com' },
    });

    expect(event).toEqual({ request: { url: 'https://app.example.com/api/invitations/[token]' } });
  });

  it('redacts the URLs in breadcrumbs', () => {
    const event = scrubReportedEvent({
      breadcrumbs: [
        { data: { url: '/api/auth/reset-password/abc123?callbackURL=x', method: 'GET' } },
        { data: { from: '/convites/abc123', to: '/redefinir-senha?token=abc' } },
      ],
    });

    expect(event.breadcrumbs).toEqual([
      { data: { url: '/api/auth/reset-password/[token]', method: 'GET' } },
      { data: { from: '/convites/[token]', to: '/redefinir-senha' } },
    ]);
  });
});
