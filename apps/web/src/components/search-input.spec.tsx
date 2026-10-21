import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SearchInput } from './search-input';

function Search() {
  const [value, setValue] = useState('');
  return (
    <SearchInput
      id="busca"
      label="Buscar lançamento"
      placeholder="Descrição, categoria, pessoa…"
      value={value}
      onChange={setValue}
    />
  );
}

describe('SearchInput', () => {
  it('is named by its label, hints what it looks in and clears what was typed', async () => {
    render(<Search />);
    const field = screen.getByRole('searchbox', { name: 'Buscar lançamento' });
    expect(field).toHaveAttribute('placeholder', 'Descrição, categoria, pessoa…');
    expect(screen.queryByRole('button', { name: 'Limpar busca' })).not.toBeInTheDocument();

    await userEvent.type(field, 'mercado');
    await userEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Limpar busca' })).not.toBeInTheDocument();
  });
});
