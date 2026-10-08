import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FormField } from './form-field';
import { PasswordInput } from './password-input';

describe('PasswordInput', () => {
  it('hides the password until asked, and hides it again', async () => {
    render(
      <FormField id="senha" label="Senha">
        <PasswordInput autoComplete="current-password" />
      </FormField>,
    );
    const field = screen.getByLabelText('Senha');
    await userEvent.type(field, 'segredo-de-teste');
    expect(field).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveValue('segredo-de-teste');

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(field).toHaveAttribute('type', 'password');
  });

  it('keeps the error wiring of FormField', () => {
    render(
      <FormField id="senha" label="Senha" error="Informe a senha.">
        <PasswordInput />
      </FormField>,
    );
    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription('Informe a senha.');
    expect(screen.getByRole('button', { name: 'Mostrar senha' })).toHaveAttribute(
      'aria-controls',
      'senha',
    );
  });
});
