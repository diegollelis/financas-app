import { TRANSACTION_NOTES_MAX_LENGTH } from '@financas/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NotesTextarea } from './notes-textarea';

describe('NotesTextarea', () => {
  it('takes line breaks, stops at the limit and counts only near it', async () => {
    render(<NotesTextarea aria-label="Observações" />);
    const field = screen.getByRole('textbox', { name: 'Observações' });
    expect(field).toHaveAttribute('maxlength', String(TRANSACTION_NOTES_MAX_LENGTH));

    await userEvent.type(field, 'Primeira linha{Enter}Segunda linha');
    expect(field).toHaveValue('Primeira linha\nSegunda linha');
    expect(screen.queryByText(/ de 1\.000$/)).not.toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'a'.repeat(950) } });
    expect(screen.getByText('950 de 1.000')).toBeInTheDocument();
  });
});
