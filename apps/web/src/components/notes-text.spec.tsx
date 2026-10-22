import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NotesText } from './notes-text';

describe('NotesText', () => {
  it('keeps a short note as it is, with no button', () => {
    render(<NotesText text="Nota fiscal na gaveta." lines={2} />);
    expect(screen.getByText('Nota fiscal na gaveta.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows two lines of a longer one, and the whole text right there on "Ver tudo"', async () => {
    const text = 'Compra do mês.\nFaltou o azeite.\nTrocar o leite na sexta.';
    render(<NotesText text={text} lines={2} />);

    const note = screen.getByText(
      (_, element) =>
        element?.textContent === text &&
        element.tagName === 'SPAN' &&
        !element.querySelector('button'),
    );
    expect(note).toHaveClass('line-clamp-2', 'whitespace-pre-line');
    const more = screen.getByRole('button', { name: 'Ver tudo' });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(more);
    expect(note).not.toHaveClass('line-clamp-2');
    const less = screen.getByRole('button', { name: 'Ver menos' });
    expect(less).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(less);
    expect(note).toHaveClass('line-clamp-2');
  });
});
