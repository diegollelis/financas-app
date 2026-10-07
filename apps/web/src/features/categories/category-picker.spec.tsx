import type { Category } from '@financas/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { stubPrefersDark } from '@/test/match-media';
import { CategorySelect } from './category-picker';
import { mostUsed } from './most-used';

// Fictitious data (ADR 0019).
const names = [
  'Água',
  'Carro',
  'Celular',
  'Combustível',
  'Energia',
  'Farmácia',
  'Internet',
  'Mercado',
  'Streaming',
  'Viagem',
];
const uses: Record<string, number> = { Mercado: 9, Combustível: 4, Energia: 6, Viagem: 1 };
const options: Category[] = names.map((name, n) => ({
  id: `01920000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
  name,
  type: 'DEBIT',
  archived: false,
  recentUses: uses[name] ?? 0,
}));

function Field() {
  const [value, setValue] = useState('');
  return (
    <>
      <label htmlFor="category">Categoria</label>
      <CategorySelect id="category" value={value} onChange={setValue} options={options} />
    </>
  );
}

const openPicker = () => userEvent.click(screen.getByRole('combobox', { name: 'Categoria' }));

describe('mostUsed', () => {
  it('lists the most used first, leaving out the unused and the archived', () => {
    const archived = options.map((category) =>
      category.name === 'Energia' ? { ...category, archived: true } : category,
    );

    expect(mostUsed(archived).map((category) => category.name)).toEqual([
      'Mercado',
      'Combustível',
      'Viagem',
    ]);
  });

  it('is empty for a short list, which fits on the screen anyway', () => {
    expect(mostUsed(options.slice(0, 8))).toEqual([]);
  });
});

describe('CategorySelect', () => {
  it('shows the most used first, then every category, and picks one', async () => {
    render(<Field />);
    await openPicker();

    const dialog = await screen.findByRole('dialog', { name: 'Escolher categoria' });
    const top = within(dialog).getByRole('group', { name: 'Mais usadas' });
    expect(
      within(top)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Mercado', 'Energia', 'Combustível', 'Viagem']);
    const all = within(dialog).getByRole('group', { name: 'Todas' });
    expect(within(all).getAllByRole('option')).toHaveLength(names.length);
    await userEvent.click(within(top).getByRole('option', { name: 'Energia' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Categoria' })).toHaveTextContent('Energia');
  });

  it('finds a name whatever the accents and case typed', async () => {
    render(<Field />);
    await openPicker();

    await userEvent.type(await screen.findByRole('combobox', { name: 'Buscar categoria' }), 'AGUA');

    // Only the full list while searching: no name twice.
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Água']);
    await userEvent.clear(screen.getByRole('combobox', { name: 'Buscar categoria' }));
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar categoria' }), 'xyz');
    expect(screen.getByText('Nenhuma categoria com esse nome.')).toBeInTheDocument();
  });

  it('opens as a popover with the search focused from md', async () => {
    stubPrefersDark(false, { desktop: true });
    render(<Field />);
    await openPicker();

    const search = await screen.findByRole('combobox', { name: 'Buscar categoria' });
    expect(search).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: 'Escolher categoria' })).not.toBeInTheDocument();
    await userEvent.type(search, 'comb');
    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('combobox', { name: 'Categoria' })).toHaveTextContent('Combustível');
  });
});
