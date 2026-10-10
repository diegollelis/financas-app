import {
  changeEmailInputSchema,
  changePasswordFormSchema,
  updateNameInputSchema,
  type ChangePasswordForm,
  type UpdateNameInput,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authErrorMessage } from '@/features/auth/auth-error-message';
import { useRequestPasswordReset } from '@/features/auth/use-auth-mutations';
import { useCurrentUser } from '@/features/auth/use-me';
import {
  useAccountSecurity,
  useChangeEmail,
  useChangePassword,
  useRevokeOtherSessions,
  useUpdateName,
} from './use-account-security';

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

/**
 * One line of "Conta": what it is on the left, the action on the right. The term and its
 * descriptions sit right inside the group, as a <dl> requires (axe); the action is a description
 * of its own, laid out in a second column.
 */
function AccountRow({
  label,
  children,
  action,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5">
      <dt className="text-muted-foreground col-start-1 text-sm">{label}</dt>
      <dd className="col-start-1 break-words">{children}</dd>
      {action && <dd className="col-start-2 row-span-2 row-start-1 self-center">{action}</dd>}
    </div>
  );
}

function NameForm({ onDone }: { onDone: () => void }) {
  const user = useCurrentUser();
  const update = useUpdateName();
  const { register, handleSubmit, formState } = useForm<UpdateNameInput>({
    resolver: zodResolver(updateNameInputSchema),
    defaultValues: { name: user.name },
  });
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) =>
        void handleSubmit((input) =>
          update.mutate(input, {
            onSuccess: () => {
              toast.success('Nome alterado');
              onDone();
            },
          }),
        )(event)
      }
    >
      <FormField id="account-name" label="Nome" error={formState.errors.name?.message}>
        <Input autoComplete="name" {...register('name')} />
      </FormField>
      {update.isError && (
        <p role="alert" className="text-destructive">
          {authErrorMessage(update.error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * The new address. Once sent, the dialog says where the link went and stays until closed: the
 * e-mail changes only when that link is opened.
 */
function EmailForm({ onDone }: { onDone: () => void }) {
  const user = useCurrentUser();
  const change = useChangeEmail();
  const schema = changeEmailInputSchema
    .pick({ newEmail: true })
    .refine((input) => input.newEmail.trim().toLowerCase() !== user.email.toLowerCase(), {
      message: 'Este já é o e-mail da sua conta.',
      path: ['newEmail'],
    });
  const { register, handleSubmit, formState } = useForm<{ newEmail: string }>({
    resolver: zodResolver(schema),
    defaultValues: { newEmail: '' },
  });

  if (change.isSuccess) {
    return (
      <div className="grid gap-4">
        <p role="status">
          Enviamos um link para <strong>{change.variables.newEmail}</strong>. O e-mail da conta muda
          quando você abrir esse link; até lá, continua {user.email}. Avisamos também o endereço
          atual.
        </p>
        <Button className="sm:justify-self-end" onClick={onDone}>
          Fechar
        </Button>
      </div>
    );
  }
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) =>
        void handleSubmit(({ newEmail }) => change.mutate({ newEmail: newEmail.trim() }))(event)
      }
    >
      <FormField id="new-email" label="Novo e-mail" error={formState.errors.newEmail?.message}>
        <Input type="email" autoComplete="email" {...register('newEmail')} />
      </FormField>
      {change.isError && (
        <p role="alert" className="text-destructive">
          {authErrorMessage(change.error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={change.isPending}>
          {change.isPending ? 'Enviando…' : 'Enviar link de confirmação'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const change = useChangePassword();
  const { register, handleSubmit, formState } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) =>
        void handleSubmit(({ currentPassword, newPassword }) =>
          change.mutate(
            { currentPassword, newPassword },
            {
              onSuccess: () => {
                toast.success('Senha trocada. Os outros aparelhos foram desconectados.');
                onDone();
              },
            },
          ),
        )(event)
      }
    >
      <FormField
        id="current-password"
        label="Senha atual"
        error={formState.errors.currentPassword?.message}
      >
        <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
      </FormField>
      <FormField id="new-password" label="Nova senha" error={formState.errors.newPassword?.message}>
        <PasswordInput autoComplete="new-password" {...register('newPassword')} />
      </FormField>
      <FormField
        id="confirm-password"
        label="Repita a nova senha"
        error={formState.errors.confirmPassword?.message}
      >
        <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
      </FormField>
      {change.isError && (
        <p role="alert" className="text-destructive">
          {authErrorMessage(change.error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={change.isPending}>
          {change.isPending ? 'Trocando…' : 'Trocar senha'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * The name and the password, in "Conta" (ADR 0049). An account created with Google has no
 * password: it gets one through the same e-mailed link as "Esqueci minha senha".
 */
export function AccountDetails({ children }: { children?: ReactNode }) {
  const user = useCurrentUser();
  const security = useAccountSecurity();
  const createPassword = useRequestPasswordReset();
  const [editing, setEditing] = useState<'name' | 'email' | 'password' | null>(null);
  const nameButton = useRef<HTMLButtonElement>(null);
  const emailButton = useRef<HTMLButtonElement>(null);
  const passwordButton = useRef<HTMLButtonElement>(null);
  const close = () => setEditing(null);
  const hasPassword = security.data?.hasPassword;

  return (
    <>
      <dl className="grid gap-4 rounded-xl border p-4">
        <AccountRow
          label="Nome"
          action={
            <Button ref={nameButton} variant="outline" size="sm" onClick={() => setEditing('name')}>
              Alterar nome
            </Button>
          }
        >
          {user.name}
        </AccountRow>
        <AccountRow
          label="E-mail"
          action={
            <Button
              ref={emailButton}
              variant="outline"
              size="sm"
              onClick={() => setEditing('email')}
            >
              Trocar e-mail
            </Button>
          }
        >
          {user.email}
        </AccountRow>
        {security.isSuccess && (
          <AccountRow
            label="Senha"
            action={
              hasPassword ? (
                <Button
                  ref={passwordButton}
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing('password')}
                >
                  Trocar senha
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={createPassword.isPending}
                  onClick={() =>
                    createPassword.mutate(
                      { email: user.email },
                      {
                        onSuccess: () =>
                          toast.success(`Enviamos um link para criar a senha em ${user.email}.`),
                        onError: (error) => toast.error(authErrorMessage(error)),
                      },
                    )
                  }
                >
                  Criar senha
                </Button>
              )
            }
          >
            {hasPassword ? (
              'Definida'
            ) : (
              <span className="text-muted-foreground">
                Sem senha: você entra com o Google. Com uma senha, entra também pelo e-mail.
              </span>
            )}
          </AccountRow>
        )}
        {children}
      </dl>
      {/* Outside the list: a <dl> holds only its terms and descriptions. */}
      <ResponsiveDialog
        open={editing === 'name'}
        onOpenChange={(open) => !open && close()}
        returnFocusTo={nameButton}
        title="Alterar nome"
        description="O nome aparece para as pessoas dos espaços que você compartilha."
      >
        <NameForm onDone={close} />
      </ResponsiveDialog>
      <ResponsiveDialog
        open={editing === 'email'}
        onOpenChange={(open) => !open && close()}
        returnFocusTo={emailButton}
        title="Trocar e-mail"
        description="Enviamos um link para o novo endereço. O e-mail só muda depois que você abrir esse link."
      >
        <EmailForm onDone={close} />
      </ResponsiveDialog>
      <ResponsiveDialog
        open={editing === 'password'}
        onOpenChange={(open) => !open && close()}
        returnFocusTo={passwordButton}
        title="Trocar senha"
        description="Os outros aparelhos conectados à sua conta saem; este continua."
      >
        <PasswordForm onDone={close} />
      </ResponsiveDialog>
    </>
  );
}

/** How many devices are listed before "Ver todos": this one and the 4 most recent. */
const DEVICES_SHOWN = 5;

/** "Aparelhos conectados" (ADR 0049): where the account is signed in, and a way to end the rest. */
export function ConnectedDevices() {
  const security = useAccountSecurity();
  const revoke = useRevokeOtherSessions();
  const [showAll, setShowAll] = useState(false);
  if (!security.isSuccess) return null;
  const { sessions } = security.data;
  const others = sessions.filter((session) => !session.current).length;
  // This device and the most recent ones; the rest on request, so a long list never takes the page.
  const shown = showAll ? sessions : sessions.slice(0, DEVICES_SHOWN);

  return (
    <section aria-labelledby="account-devices" className="grid gap-3">
      <h2 id="account-devices" className="font-medium">
        Aparelhos conectados
      </h2>
      <ul className="divide-y rounded-xl border px-4">
        {shown.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span className="grid gap-0.5">
              <span>
                {session.browser} no {session.os}
              </span>
              <span className="text-muted-foreground text-sm tabular-nums">
                Último acesso em {dateTime.format(new Date(session.lastActiveAt))}
              </span>
            </span>
            {session.current && <Badge variant="secondary">Este aparelho</Badge>}
          </li>
        ))}
      </ul>
      {shown.length < sessions.length && (
        <Button variant="ghost" className="justify-self-start" onClick={() => setShowAll(true)}>
          Ver todos os {sessions.length} aparelhos
        </Button>
      )}
      {others > 0 && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="justify-self-start" disabled={revoke.isPending}>
              Sair dos outros aparelhos
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sair dos outros aparelhos?</AlertDialogTitle>
              <AlertDialogDescription>
                {others === 1
                  ? 'O outro aparelho precisa'
                  : `Os outros ${others} aparelhos precisam`}{' '}
                entrar de novo, com a senha ou o Google. Este continua conectado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  revoke.mutate(undefined, {
                    onSuccess: () => toast.success('Os outros aparelhos foram desconectados'),
                    onError: (error) => toast.error(authErrorMessage(error)),
                  })
                }
              >
                Sair dos outros aparelhos
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}
