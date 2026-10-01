# packages/shared

Schemas Zod, tipos e constantes compartilhados entre `apps/web` e `apps/api` ([ADR 0006](../../docs/adr/0006-validacao-zod-compartilhada.md)).

Não há build: os consumidores importam o TypeScript direto de `src/` ([ADR 0015](../../docs/adr/0015-shared-como-codigo-fonte.md)).

## Uso

```ts
import { healthResponseSchema, type HealthResponse } from '@financas/shared';
```

O pacote consumidor declara `"@financas/shared": "workspace:*"` no `package.json`.

## Regras

- Imports relativos **com extensão `.ts`**: `export * from './health.ts'`.
- Sem `enum`, `namespace` ou _parameter properties_ (o type stripping do Node não os suporta). Para listas fixas, use `z.enum([...])`.
- Cada schema exporta também o tipo inferido: `export type X = z.infer<typeof xSchema>`.
- Todo novo arquivo é reexportado em `src/index.ts`.
