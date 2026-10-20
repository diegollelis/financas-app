import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InfoTip } from './info-tip';

describe('InfoTip', () => {
  it('shows the meaning of a term on a click, and closes with Esc, back on the icon', async () => {
    render(
      <p>
        Saldo previsto
        <InfoTip term="Saldo previsto">
          <p>Como o mês termina se tudo o que está previsto for recebido e pago.</p>
        </InfoTip>
      </p>,
    );
    const icon = screen.getByRole('button', { name: 'Sobre Saldo previsto' });
    expect(screen.queryByText(/Como o mês termina/)).not.toBeInTheDocument();

    await userEvent.click(icon);

    const bubble = screen.getByRole('dialog', { name: 'Saldo previsto' });
    expect(bubble).toHaveTextContent(
      'Saldo previstoComo o mês termina se tudo o que está previsto for recebido e pago.',
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(icon).toHaveFocus();
  });
});
