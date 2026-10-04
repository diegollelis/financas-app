import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, noSession } from '@/test/mock-api';
import { renderApp } from '@/test/render';

describe('PrivacyPage', () => {
  it('is public: it opens without a session and calls no API', async () => {
    const fetchMock = mockApi({});
    renderApp('/privacidade');

    expect(
      await screen.findByRole('heading', { name: 'Política de privacidade' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /@/ })[0]).toHaveAttribute(
      'href',
      expect.stringMatching(/^mailto:/),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is linked from the sign-in page, as Google requires', async () => {
    mockApi({ 'GET /api/me': noSession });
    const { router } = renderApp('/entrar');

    await userEvent.click(await screen.findByRole('link', { name: 'Política de privacidade' }));

    expect(router.state.location.pathname).toBe('/privacidade');
  });
});
