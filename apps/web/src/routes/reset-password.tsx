import {
  PASSWORD_MIN_LENGTH,
  resetPasswordFormSchema,
  type ResetPasswordForm,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
import { TextLink } from '@/components/text-link';
import { PasswordInput } from '@/components/password-input';
import { AuthCard } from '@/features/auth/auth-card';
import { authErrorMessage } from '@/features/auth/auth-error-message';
import { useResetPassword } from '@/features/auth/use-auth-mutations';

const requestNewLink = <TextLink to="/esqueci-senha">Pedir um novo link</TextLink>;

/**
 * Opened from the e-mail: the API checks the token and redirects here with `?token=` (or with
 * `?error=` when the link is invalid or expired).
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const resetPassword = useResetPassword();
  const { register, handleSubmit, formState } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  if (!token || searchParams.has('error')) {
    return (
      <AuthCard title="Link inválido" footer={requestNewLink}>
        <p role="alert" className="text-sm">
          Este link é inválido ou expirou. Os links valem por 1 hora e só podem ser usados uma vez.
        </p>
      </AuthCard>
    );
  }

  const submit = ({ password }: ResetPasswordForm) =>
    resetPassword.mutate(
      { newPassword: password, token },
      {
        onSuccess: () =>
          void navigate('/entrar', {
            replace: true,
            state: { notice: 'Senha alterada. Entre com a nova senha.' },
          }),
      },
    );

  return (
    <AuthCard
      title="Criar nova senha"
      description="Depois de salvar, você vai sair de todos os aparelhos."
      footer={requestNewLink}
    >
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(event) => void handleSubmit(submit)(event)}
      >
        <FormField
          id="password"
          label={`Nova senha (mínimo de ${PASSWORD_MIN_LENGTH} caracteres)`}
          error={formState.errors.password?.message}
        >
          <PasswordInput autoComplete="new-password" {...register('password')} />
        </FormField>
        <FormField
          id="confirmPassword"
          label="Repita a nova senha"
          error={formState.errors.confirmPassword?.message}
        >
          <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
        </FormField>
        {resetPassword.isError && (
          <p role="alert" className="text-destructive text-sm">
            {authErrorMessage(resetPassword.error)}
          </p>
        )}
        <SubmitButton
          pending={resetPassword.isPending}
          label="Salvar nova senha"
          pendingLabel="Salvando…"
        />
      </form>
    </AuthCard>
  );
}
