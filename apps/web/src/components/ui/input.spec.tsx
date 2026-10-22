import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';

describe('Input', () => {
  it('drops the native look of date and month fields only, so they fit an iPhone', () => {
    render(
      <>
        <Input aria-label="Data" type="date" />
        <Input aria-label="Mês" type="month" />
        <Input aria-label="Descrição" />
      </>,
    );
    expect(screen.getByLabelText('Data')).toHaveClass('appearance-none', 'max-w-full');
    expect(screen.getByLabelText('Mês')).toHaveClass('appearance-none', 'max-w-full');
    expect(screen.getByLabelText('Descrição')).not.toHaveClass('appearance-none');
  });
});
