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
    // Only the skeleton at first: the symbol comes with the words.
    expect(document.querySelector('img')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(SLOW_LOADING_MS);
    });

    // The symbol with its rings and the first step's words, above the skeleton.
    expect(screen.getByText('Aguardando o servidor…')).toBeInTheDocument();
    expect(document.querySelector('img')).toHaveAttribute('src', '/brand/cl-symbol.png');
  });
});
