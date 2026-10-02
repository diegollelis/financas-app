import { PASSWORD_MIN_LENGTH, signUpInputSchema, type SignUpInput } from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthCard } from '@/features/auth/auth-card';
import { GoogleButton } from '@/features/auth/google-button';
import { authErrorMessage } from '@/features/auth/auth-error-message';
import { useSignUp } from '@/features/auth/use-auth-mutations';

export function SignUpPage() {
  const signUp = useSignUp();
  const { register, handleSubmit, formState } = useForm<SignUpInput>({
    resolver: zodResolver(signUpInputSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  return (
    <AuthCard
      title="Criar conta"
      description="Comece a organizar o seu mês."
      footer={
        <span>
          Já tem conta?{' '}
          <Link to="/entrar" className="text-primary underline-offset-4 hover:underline">
            Entrar
          </Link>
        </span>
      }
    >
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(event) => void handleSubmit((input) => signUp.mutate(input))(event)}
      >
        <FormField id="name" label="Nome" error={formState.errors.name?.message}>
          <Input autoComplete="name" {...register('name')} />
        </FormField>
        <FormField id="email" label="E-mail" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </FormField>
        <FormField
          id="password"
          label={`Senha (mínimo de ${PASSWORD_MIN_LENGTH} caracteres)`}
          error={formState.errors.password?.message}
        >
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </FormField>
        {signUp.isError && (
          <p role="alert" className="text-destructive text-sm">
            {authErrorMessage(signUp.error)}
          </p>
        )}
        <Button type="submit" disabled={signUp.isPending}>
          {signUp.isPending ? 'Criando conta…' : 'Criar conta'}
        </Button>
      </form>
      <GoogleButton />
    </AuthCard>
  );
}
