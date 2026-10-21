import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '@/lib/app-version';
import { mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

describe('AppFooter', () => {
  it('shows the version in production, linking to its release', async () => {
    // Set at build time from the root package.json (ADR 0050 note).
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    mockApi({});
    renderApp('/termos');

    const link = await screen.findByRole('link', { name: /^Versão/ });
    expect(link).toHaveTextContent(`Versão ${APP_VERSION} (abre em outra aba)`);
    expect(link).toHaveAttribute(
      'href',
      `https://github.com/diegollelis/financas-app/releases/tag/v${APP_VERSION}`,
    );
    expect(link).toHaveAttribute('target', '_blank');
  });
});
