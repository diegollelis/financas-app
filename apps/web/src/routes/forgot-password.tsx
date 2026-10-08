import { forgotPasswordInputSchema, type ForgotPasswordInput } from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
import { TextLink } from '@/components/text-link';
import { Input } from '@/components/ui/input';
import { AuthCard } from '@/features/auth/auth-card';
import { authErrorMessage } from '@/features/auth/auth-error-message';
import { useRequestPasswordReset } from '@/features/auth/use-auth-mutations';

export function ForgotPasswordPage() {
  const requestReset = useRequestPasswordReset();
  const { register, handleSubmit, formState } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordInputSchema),
    defaultValues: { email: '' },
  });

  return (
    <AuthCard
      title="Esqueci minha senha"
      description="Enviaremos um link para você criar uma nova senha."
      footer={<TextLink to="/entrar">Voltar para o login</TextLink>}
    >
      {requestReset.isSuccess ? (
        // The same answer whether or not the e-mail has an account (no account enumeration).
        <p role="status" className="text-sm">
          Se houver uma conta com esse e-mail, você vai receber um link em instantes. Confira também
          a caixa de spam.
        </p>
      ) : (
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => void handleSubmit((input) => requestReset.mutate(input))(event)}
        >
          <FormField id="email" label="E-mail" error={formState.errors.email?.message}>
            <Input type="email" autoComplete="email" {...register('email')} />
          </FormField>
          {requestReset.isError && (
            <p role="alert" className="text-destructive text-sm">
              {authErrorMessage(requestReset.error)}
            </p>
          )}
          <SubmitButton
            pending={requestReset.isPending}
            label="Enviar link"
            pendingLabel="Enviando…"
          />
        </form>
      )}
    </AuthCard>
  );
}
