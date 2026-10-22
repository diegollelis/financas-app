import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NotesText } from './notes-text';

describe('NotesText', () => {
  it('keeps a short note as it is, with no button', () => {
    render(<NotesText text="Nota fiscal na gaveta." lines={2} about="Mercado" />);
    expect(screen.getByText('Nota fiscal na gaveta.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows two lines of a longer one, and the whole text in a dialog on "Ver tudo"', async () => {
    const text = 'Compra do mês.\nFaltou o azeite.\nTrocar o leite na sexta.';
    render(<NotesText text={text} lines={2} about="Mercado" />);

    // Named after the transaction: a list has many "Ver tudo".
    const more = screen.getByRole('button', { name: 'Ver tudo: observações de Mercado' });
    await userEvent.click(more);
    const dialog = await screen.findByRole('dialog', { name: 'Observações' });
    expect(dialog).toHaveAccessibleDescription('Mercado');
    expect(within(dialog).getByText(/Trocar o leite na sexta\./)).toBeInTheDocument();

    // The list never grows: the card keeps its two lines.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });
});
