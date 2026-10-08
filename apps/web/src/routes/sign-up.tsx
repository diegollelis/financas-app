import {
  PASSWORD_MIN_LENGTH,
  PRIVACY_PATH,
  signUpInputSchema,
  TERMS_PATH,
  type SignUpInput,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { FormField } from '@/components/form-field';
import { TextLink } from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PasswordInput } from '@/components/password-input';
import { Input } from '@/components/ui/input';
import { AuthCard } from '@/features/auth/auth-card';
import { CheckEmail } from '@/features/auth/check-email';
import { GoogleButton } from '@/features/auth/google-button';
import { useReturnTo, withReturnTo } from '@/features/auth/return-to';
import { authErrorMessage } from '@/features/auth/auth-error-message';
import { useSignUp } from '@/features/auth/use-auth-mutations';

export function SignUpPage() {
  const returnTo = useReturnTo();
  const signUp = useSignUp(returnTo);
  const { register, handleSubmit, formState, control } = useForm<SignUpInput>({
    resolver: zodResolver(signUpInputSchema),
    defaultValues: { name: '', email: '', password: '', acceptTerms: false },
  });
  const termsError = formState.errors.acceptTerms?.message;
  const footer = (
    <span>
      Já tem conta? <TextLink to={withReturnTo('/entrar', returnTo)}>Entrar</TextLink>
    </span>
  );

  // No session yet: the account waits for the e-mail to be verified (ADR 0022).
  if (signUp.isSuccess) {
    return (
      <AuthCard title="Confira seu e-mail" footer={footer}>
        <CheckEmail
          email={signUp.variables.email}
          returnTo={returnTo}
          // Back to the form, as it was filled in, to fix a mistyped e-mail.
          onChangeEmail={() => signUp.reset()}
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Criar conta" description="Comece a organizar o seu mês." footer={footer}>
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
          <PasswordInput autoComplete="new-password" {...register('password')} />
        </FormField>
        {/* Required (ADR 0041). The links open the documents; the rest of the text checks the box. */}
        <div className="grid gap-2">
          <div className="flex items-start gap-1">
            <Controller
              control={control}
              name="acceptTerms"
              render={({ field }) => (
                <label
                  htmlFor="accept-terms"
                  // Pulled left by the extra room, so the box lines up with the fields.
                  className="-ml-3.5 flex size-11 shrink-0 cursor-pointer items-center justify-center md:-ml-1 md:size-6"
                >
                  <Checkbox
                    id="accept-terms"
                    ref={field.ref}
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    onBlur={field.onBlur}
                    aria-invalid={termsError ? true : undefined}
                    aria-describedby={termsError ? 'accept-terms-error' : undefined}
                  />
                </label>
              )}
            />
            <label htmlFor="accept-terms" className="cursor-pointer py-2.5 md:py-0.5">
              Li e aceito os{' '}
              <Link to={TERMS_PATH} className="text-primary underline">
                Termos de uso
              </Link>{' '}
              e a{' '}
              <Link to={PRIVACY_PATH} className="text-primary underline">
                Política de privacidade
              </Link>
              .
            </label>
          </div>
          {termsError && (
            <p id="accept-terms-error" className="text-destructive text-sm">
              {termsError}
            </p>
          )}
        </div>
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
