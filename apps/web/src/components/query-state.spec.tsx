import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoadingState, SLOW_LOADING_MS } from './query-state';

describe('LoadingState', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('explains the cold start only when loading takes a while', () => {
    vi.useFakeTimers();
    render(<LoadingState>conteúdo</LoadingState>);

    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    expect(screen.queryByText(/Aguardando o servidor/)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(SLOW_LOADING_MS);
    });

    expect(
      screen.getByText('Aguardando o servidor… isso pode levar até um minuto.'),
    ).toBeInTheDocument();
  });
});
