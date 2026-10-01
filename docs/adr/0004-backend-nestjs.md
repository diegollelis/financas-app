# 0004 — Backend: NestJS (Node + TypeScript)

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

Backend REST para uma aplicação multiusuário pública. O desenvolvedor vem do Protheus (AdvPL/MVC) e quer uma base estruturada para aprender arquitetura em camadas, mantendo uma única linguagem no projeto.

## Opções consideradas

1. **Express/Fastify puro** — mínimo, mas toda a arquitetura fica por conta própria.
2. **.NET (ASP.NET Core)** — muito forte no mercado corporativo; exigiria uma segunda linguagem desde já.
3. **Java/Spring Boot** — idem, com mais cerimônia.
4. **NestJS** — opinativo: módulos, injeção de dependência, decorators; TypeScript ponta a ponta.

## Decisão

**NestJS** (adaptador Express, decidido em [0014](0014-api-nest12-esm-express.md)), organizado por módulos de domínio, cada um com:

- `controller` — HTTP: rotas, DTOs, status codes;
- `service` — regras de negócio;
- `repository` — acesso a dados via Prisma, **sempre** filtrando por espaço ([0008](0008-multi-tenancy-por-espaco.md)).

Documentação da API com **OpenAPI/Swagger** gerado pelo Nest.

## Consequências

- Paralelo com o Protheus: módulo Nest ≈ rotina MVC; service ≈ regras do ModelDef; controller ≈ serviço REST.
- .NET fica como possível segunda stack de estudo no futuro, sem impacto neste projeto.
- A API roda em container Docker ([0009](0009-hospedagem-gratuita.md)).
