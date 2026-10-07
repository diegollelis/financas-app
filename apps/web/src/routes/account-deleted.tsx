import { TextLink } from '@/components/text-link';
import { AuthCard } from '@/features/auth/auth-card';

/** Public: where the app lands once the account is gone (ADR 0041). */
export function AccountDeletedPage() {
  return (
    <AuthCard title="Conta excluída" footer={<TextLink to="/entrar">Ir para o início</TextLink>}>
      <p role="status">
        A sua conta e os seus dados foram apagados. As cópias de segurança do banco, que são
        criptografadas, deixam de ter esses dados em até 30 dias, quando vencem.
      </p>
    </AuthCard>
  );
}
