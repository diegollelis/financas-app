import { signInInputSchema, type SignInInput } from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthCard } from '@/features/auth/auth-card';
import { authErrorMessage } from '@/features/auth/auth-error-message';
import { useSignIn } from '@/features/auth/use-auth-mutations';

/** Other pages can send a message here, e.g. after a password reset. */
const locationStateSchema = z.object({ notice: z.string() });

export function SignInPage() {
  const notice = locationStateSchema.safeParse(useLocation().state).data?.notice;
  const signIn = useSignIn();
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
          <Link to="/cadastro" className="text-primary underline-offset-4 hover:underline">
            Cadastre-se
          </Link>
        </span>
      }
    >
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
          <Input type="password" autoComplete="current-password" {...register('password')} />
        </FormField>
        <Link
          to="/esqueci-senha"
          className="text-primary -mt-2 justify-self-end text-sm underline-offset-4 hover:underline"
        >
          Esqueci minha senha
        </Link>
        {signIn.isError && (
          <p role="alert" className="text-destructive text-sm">
            {authErrorMessage(signIn.error)}
          </p>
        )}
        <Button type="submit" disabled={signIn.isPending}>
          {signIn.isPending ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthCard>
  );
}
