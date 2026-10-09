import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SLOW_LOADING_MS } from './query-state';
import { SubmitButton } from './submit-button';

const wake = 'Aguardando o servidor… isso pode levar até um minuto.';

describe('SubmitButton', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says what it does while idle', () => {
    render(<SubmitButton pending={false} label="Entrar" pendingLabel="Entrando…" />);
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    expect(screen.queryByText(wake)).not.toBeInTheDocument();
  });

  it('explains a slow answer: the API may be waking up', () => {
    vi.useFakeTimers();
    render(<SubmitButton pending label="Entrar" pendingLabel="Entrando…" />);
    expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled();
    expect(screen.queryByText(wake)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(SLOW_LOADING_MS);
    });

    expect(screen.getByText(wake)).toBeInTheDocument();
  });
});
