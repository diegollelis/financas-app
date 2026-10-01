# 0014 — API: NestJS 12 em ESM, adaptador Express e configuração validada

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

O [ADR 0004](0004-backend-nestjs.md) escolheu o NestJS e deixou para a fase 1 a escolha do adaptador HTTP (Express ou Fastify). Ao iniciar a fase 1, a versão corrente é o **Nest 12**, que mudou dois pontos relevantes:

- os pacotes passaram a ser **ESM** (`"type": "module"`), e o template oficial oferece uma variante ESM com Vitest;
- o `@nestjs/common` traz um `StandardSchemaValidationPipe`, que valida com qualquer biblioteca compatível com [Standard Schema](https://github.com/standard-schema/standard-schema). O Zod 4 é compatível.

Também é preciso decidir como a API lê e valida as variáveis de ambiente.

## Opções consideradas

1. **Adaptador Fastify** — mais rápido, mas o desempenho não é gargalo aqui, há menos material de estudo, e a integração Nest + Better Auth ([0007](0007-autenticacao-better-auth.md)) é mais madura no Express.
2. **Adaptador Express** — padrão do Nest, o mais documentado.
3. **Validação: `nestjs-zod` ou `class-validator`** — o primeiro é uma dependência extra que o pipe nativo dispensa; o segundo duplicaria as regras ([0006](0006-validacao-zod-compartilhada.md)).
4. **Configuração: `process.env` direto** ou **`@nestjs/config` com `validate` em Zod**.

## Decisão

- **Nest 12 em ESM**, seguindo o template oficial `ts-esm`: `"type": "module"`, `module: nodenext` e imports relativos com extensão `.js`.
- Adaptador **Express**.
- Validação de entrada com o **`StandardSchemaValidationPipe`** nativo, recebendo os schemas Zod de `packages/shared`.
- **`@nestjs/config`** com uma função `validate` baseada em um schema Zod (`src/config/env.ts`): a API **não sobe** com variável ausente ou inválida, e o `ConfigService` fica tipado.
- **Swagger** em `/docs`, apenas fora de produção.
- Porta local padrão **3333**. Na máquina de desenvolvimento, as portas 3000/3001 estão encaminhadas para o WSL por um portproxy do Windows. Em produção, o Render define a `PORT`.

## Consequências

- Imports relativos exigem a extensão `.js` mesmo no arquivo `.ts` (`import { X } from './x.js'`). É a regra do ESM no Node, que o TypeScript não reescreve.
- O ESM permite importar `packages/shared` também como ESM, sem camada de compatibilidade.
- Se o Swagger precisar descrever os schemas Zod, usar `z.toJSONSchema()` para gerar o OpenAPI, sem duplicar DTOs.
- O script de telemetria `@scarf/scarf` (dependência do swagger-ui) fica negado em `allowBuilds` no `pnpm-workspace.yaml`.
