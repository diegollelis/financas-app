import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSignOut } from '@/features/auth/use-auth-mutations';
import { useCurrentUser } from '@/features/auth/use-me';
import { useHealth } from '@/features/health/use-health';

export function HomePage() {
  const user = useCurrentUser();
  const signOut = useSignOut();
  const health = useHealth();

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>Olá, {user.name}</h1>
          </CardTitle>
          <CardDescription>Controle financeiro mensal</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div className="flex items-center justify-between">
            <span>Status da API</span>
            {health.isPending && <Badge variant="secondary">Verificando…</Badge>}
            {health.isError && <Badge variant="destructive">Indisponível</Badge>}
            {health.isSuccess &&
              (health.data.status === 'ok' ? (
                <Badge>Online</Badge>
              ) : (
                <Badge variant="outline">Sem banco de dados</Badge>
              ))}
          </div>
          {signOut.isError && (
            <p role="alert" className="text-destructive">
              Não foi possível sair agora. Tente de novo.
            </p>
          )}
          <Button variant="outline" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
