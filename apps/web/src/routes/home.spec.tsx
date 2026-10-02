import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { HomePage } from './home';

function mockApi(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('HomePage', () => {
  it('shows Online when the API and the database are up', async () => {
    const fetchMock = mockApi(200, { status: 'ok', database: 'up' });

    renderWithProviders(<HomePage />);

    expect(screen.getByText('Verificando…')).toBeInTheDocument();
    expect(await screen.findByText('Online')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/health', 'http://api.test'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('warns when the database is down', async () => {
    mockApi(200, { status: 'degraded', database: 'down' });

    renderWithProviders(<HomePage />);

    expect(await screen.findByText('Sem banco de dados')).toBeInTheDocument();
  });

  it('shows unavailable when the API fails', async () => {
    mockApi(500, {});

    renderWithProviders(<HomePage />);

    expect(await screen.findByText('Indisponível')).toBeInTheDocument();
  });

  it('shows unavailable when the API breaks the contract', async () => {
    mockApi(200, { status: 'up' });

    renderWithProviders(<HomePage />);

    expect(await screen.findByText('Indisponível')).toBeInTheDocument();
  });
});
