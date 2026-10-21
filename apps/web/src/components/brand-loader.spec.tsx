import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrandLoader } from './brand-loader';
import { LATE_MS, SLOW_LOADING_MS, WAKING_MS } from '@/lib/use-server-wait';

describe('BrandLoader', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the CL symbol with rings leaving it, still for whoever asks for less motion', () => {
    const { container } = render(<BrandLoader />);

    // Decorative: the status says what is happening.
    const symbol = container.querySelector('img');
    expect(symbol).toHaveAttribute('src', '/brand/cl-symbol.png');
    expect(symbol?.parentElement).toHaveClass('motion-safe:before:animate-ring');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
  });

  it('says it is waiting for the server only when loading takes a while, in steps', () => {
    vi.useFakeTimers();
    render(<BrandLoader />);
    const status = screen.getByRole('status');

    expect(status).not.toHaveTextContent(/servidor/);
    act(() => {
      vi.advanceTimersByTime(SLOW_LOADING_MS);
    });
    expect(status).toHaveTextContent('Aguardando o servidor…');

    act(() => {
      vi.advanceTimersByTime(WAKING_MS - SLOW_LOADING_MS);
    });
    expect(status).toHaveTextContent('Acordando o servidor, só mais um pouco…');

    act(() => {
      vi.advanceTimersByTime(LATE_MS - WAKING_MS);
    });
    expect(status).toHaveTextContent('Está demorando mais que o normal.');
  });
});
