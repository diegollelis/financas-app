import { formatIsoDate, TERMS_VERSION } from '@financas/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, noSession } from '@/test/mock-api';
import { renderApp } from '@/test/render';

describe('TermsPage', () => {
  it('is public, shows the version in force and calls no API', async () => {
    const fetchMock = mockApi({});
    renderApp('/termos');

    expect(await screen.findByRole('heading', { name: 'Termos de uso' })).toBeInTheDocument();
    expect(
      screen.getByText(`Última atualização: ${formatIsoDate(TERMS_VERSION)}`),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is linked from the sign-in page, next to the privacy policy', async () => {
    mockApi({ 'GET /api/me': noSession });
    const { router } = renderApp('/entrar');

    await userEvent.click(await screen.findByRole('link', { name: 'Termos de uso' }));

    expect(router.state.location.pathname).toBe('/termos');
  });
});
