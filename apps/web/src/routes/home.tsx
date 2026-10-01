import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHealth } from '@/features/health/use-health';

export function HomePage() {
  const health = useHealth();

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Finanças</CardTitle>
          <CardDescription>Controle financeiro mensal</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between text-sm">
          <span>Status da API</span>
          {health.isPending && <Badge variant="secondary">Verificando…</Badge>}
          {health.isError && <Badge variant="destructive">Indisponível</Badge>}
          {health.isSuccess && <Badge>Online</Badge>}
        </CardContent>
      </Card>
    </main>
  );
}
