import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { useDialogDirty } from '@/components/dialog-dirty';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { renderWithProviders } from '@/test/render';

/** A form inside the dialog, as the app's: it says when something was typed. */
function Form({ onCancel }: { onCancel: () => void }) {
  const { register, formState } = useForm({ defaultValues: { description: '' } });
  useDialogDirty(formState.isDirty);
  return (
    <>
      <label>
        Descrição
        <input {...register('description')} />
      </label>
      <button type="button" onClick={onCancel}>
        Cancelar
      </button>
    </>
  );
}

/** A dialog with a form: its own Cancelar closes it through `open`. */
function Example() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <p>{open ? 'Aberto' : 'Fechado'}</p>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Novo lançamento"
        description="Um lançamento de exemplo."
      >
        <Form onCancel={() => setOpen(false)} />
      </ResponsiveDialog>
    </>
  );
}

describe('ResponsiveDialog', () => {
  it('closes at once when nothing was typed', async () => {
    renderWithProviders(<Example />);

    await userEvent.keyboard('{Escape}');

    expect(screen.getByText('Fechado')).toBeInTheDocument();
  });

  it('asks before closing by mistake once something was typed', async () => {
    renderWithProviders(<Example />);
    await userEvent.type(screen.getByLabelText('Descrição'), 'Padaria Exemplo');

    await userEvent.keyboard('{Escape}');
    const ask = await screen.findByRole('alertdialog', { name: 'Descartar as alterações?' });
    await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));

    // Still open, with what was typed.
    expect(ask).not.toBeInTheDocument();
    expect(screen.getByLabelText('Descrição')).toHaveValue('Padaria Exemplo');

    await userEvent.keyboard('{Escape}');
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    expect(screen.getByText('Fechado')).toBeInTheDocument();
  });

  it("never asks on the form's own Cancelar", async () => {
    renderWithProviders(<Example />);
    await userEvent.type(screen.getByLabelText('Descrição'), 'Padaria Exemplo');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText('Fechado')).toBeInTheDocument();
  });
});
