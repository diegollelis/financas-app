import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrandLoader } from './brand-loader';
import { SLOW_LOADING_MS } from './query-state';

describe('BrandLoader', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('breathes the CL symbol, still for whoever asks for less motion', () => {
    render(<BrandLoader />);

    // Decorative: the status says what is happening.
    const symbol = screen.getByRole('presentation');
    expect(symbol).toHaveAttribute('src', '/brand/cl-symbol.png');
    expect(symbol).toHaveClass('motion-safe:animate-breathe');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
  });

  it('says it is waiting for the server only when loading takes a while', () => {
    vi.useFakeTimers();
    render(<BrandLoader />);

    expect(screen.queryByText(/Aguardando o servidor/)).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(SLOW_LOADING_MS);
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Aguardando o servidor… isso pode levar até um minuto.',
    );
  });
});
