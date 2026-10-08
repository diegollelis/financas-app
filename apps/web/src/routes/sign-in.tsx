import { signInInputSchema, type SignInInput } from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useLocation, useSearchParams } from 'react-router';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
import { TextLink } from '@/components/text-link';
import { PasswordInput } from '@/components/password-input';
import { Input } from '@/components/ui/input';
import { AuthCard } from '@/features/auth/auth-card';
import { GoogleButton } from '@/features/auth/google-button';
import { useReturnTo, withReturnTo } from '@/features/auth/return-to';
import { authErrorMessage } from '@/features/auth/auth-error-message';
import { useSignIn } from '@/features/auth/use-auth-mutations';

/** Other pages can send a message here, e.g. after a password reset. */
const locationStateSchema = z.object({ notice: z.string() });

export function SignInPage() {
  const returnTo = useReturnTo();
  const notice = locationStateSchema.safeParse(useLocation().state).data?.notice;
  // The API sends the browser back here with ?error= when the Google sign-in fails (ADR 0026).
  const [searchParams] = useSearchParams();
  const googleFailed = searchParams.has('error');
  const signIn = useSignIn(returnTo);
  const { register, handleSubmit, formState } = useForm<SignInInput>({
    // The same shared schema the API uses (ADR 0006): invalid input never leaves the browser.
    resolver: zodResolver(signInInputSchema),
    defaultValues: { email: '', password: '' },
  });

  return (
    <AuthCard
      title="Entrar"
      description="Acesse o seu controle financeiro."
      footer={
        <span>
          Ainda não tem conta?{' '}
          <TextLink to={withReturnTo('/cadastro', returnTo)}>Cadastre-se</TextLink>
        </span>
      }
    >
      {googleFailed && (
        <p role="alert" className="text-destructive mb-4 text-sm">
          Não foi possível entrar com o Google. Tente de novo.
        </p>
      )}
      {notice && (
        <p role="status" className="bg-muted mb-4 rounded-lg p-3 text-sm">
          {notice}
        </p>
      )}
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(event) => void handleSubmit((input) => signIn.mutate(input))(event)}
      >
        <FormField id="email" label="E-mail" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </FormField>
        <FormField id="password" label="Senha" error={formState.errors.password?.message}>
          <PasswordInput autoComplete="current-password" {...register('password')} />
        </FormField>
        <TextLink to="/esqueci-senha" className="-my-2 justify-self-end text-sm">
          Esqueci minha senha
        </TextLink>
        {signIn.isError && (
          <p role="alert" className="text-destructive text-sm">
            {authErrorMessage(signIn.error)}
          </p>
        )}
        <SubmitButton pending={signIn.isPending} label="Entrar" pendingLabel="Entrando…" />
      </form>
      <GoogleButton />
    </AuthCard>
  );
}
