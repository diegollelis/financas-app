---
name: financas-ui
description: Interface rules of this project (Finanças App), ADR 0036. Use for ANY change in apps/web (pages, components, styles, layout, copy, forms, tests of pages), and together with frontend-design, whose brief this is. Covers mobile first, the app shell, shadcn/ui, tokens, states, money and dates, accessibility, tests and the review checklist.
---

# Finanças UI

Read `docs/adr/0036-design-mobile-first.md` first if you have not in this session. This skill is the **brief** for the `frontend-design` skill: where they differ, this one wins.

## Product and audience

A personal and family monthly finance app in pt-BR, mostly used **on a phone**, often one-handed and in a hurry: record a bill, settle it, check the month's balance. The interface must feel calm and trustworthy. Numbers are the content; chrome stays quiet.

## Visual direction

- **Sober, with one brand color** (the `--primary` token) for primary actions, the active nav item and key highlights. Everything else is neutral.
- **Semantic colors are tokens**, never raw Tailwind palette classes: `--success` (settled), `--warning` (due soon or overdue), `--destructive` (delete, negative balance). Each has a `.dark` variant in `apps/web/src/index.css`. No `bg-green-100`-style hardcoded colors.
- Charts use the validated `--chart-1..3` palette (ADR 0032); never add series colors ad hoc.
- **Avoid template tells** (see `frontend-design`): no `→` appended to links or buttons, no `A · B · C` middle-dot strings, no all-caps eyebrow labels, no identical-card-everything layouts, no decorative gradients, no motion that is not a response to the user.
- **Amounts:** `tabular-nums`, right-aligned in lists, the largest text in their block. Debits and credits are told apart by sign and label, never by color alone.

## Mobile first layout

- Write the base classes for a **360 px** wide screen, then add `sm:` (640), `md:` (768) and `lg:` (1024). Never design desktop first and squeeze it down.
- **No horizontal scroll** at 360 px. Tables become stacked rows or cards below `md`. Forms are one column below `sm`.
- Page gutters `px-4`, then `sm:px-6`. Do not wrap whole pages in a `Card`. Content max width around `max-w-3xl` on desktop, left-aligned in the main column.
- **App shell** (workspace pages): a header with the workspace name and the account menu; a **bottom tab bar** below `md` (Painel, Lançamentos, Orçamento, Mais) with safe-area padding; a **sidebar** from `md`. The active item has `aria-current="page"`. Leave bottom padding so content never hides behind the bar.
- **Touch targets of 44 px or more** below `md` (`h-11` / `size-11`), with at least 8 px between neighbors. Compact sizes only from `md`.
- The main action of a page stays reachable: a fixed "Novo lançamento" button above the tab bar on mobile, a normal button on desktop.

## Components (shadcn/ui on Radix, `apps/web/src/components/ui/`)

- Use shadcn components before writing new ones. Add with `pnpm dlx shadcn@latest add <name>` from `apps/web`, then `pnpm format`.
- **Forms:** React Hook Form + `zodResolver` with the shared schema, and `FormField` (`components/form-field.tsx`). Inside a `Sheet` (side `bottom`) below `md` and a `Dialog` from `md`. Use shadcn `Select` and `RadioGroup`, not native ones.
- **Destructive actions:** `AlertDialog` with the item named ("Excluir Aluguel?"). Never one-click delete.
- **Row actions:** at most one inline action (e.g. "Efetivar"); the rest in a `DropdownMenu` (`⋯`) with an `aria-label` that names the item.
- **Feedback:** a `sonner` toast after every mutation, worded with the same verb as the button ("Lançamento excluído").
- **Class merging:** `cn` from `lib/utils.ts`. Pass conflicting Tailwind classes only if `cn` resolves them (tailwind-merge).

## States (every query-driven view)

- **Loading:** `Skeleton` shaped like the content. After about 3 s, add "Acordando o servidor… isso pode levar até um minuto." (the API sleeps on Render's free plan, ADR 0033).
- **Empty:** say what is missing and offer the action ("Nenhum lançamento em outubro. Adicionar lançamento").
- **Error:** say what failed and how to fix it, plus a "Tentar de novo" button (`refetch`). Errors from our routes go through `apiErrorMessage` (`lib/error-message.ts`). Errors never apologize.
- **404 of a workspace:** "Espaço não encontrado." with a way back.

## Content and data

- All UI text in **pt-BR**, sentence case, active voice, plain verbs. A button says what happens ("Salvar orçamento", not "Enviar"). Page URLs are pt-BR (ADR 0021).
- **Money and dates** only through `packages/shared/src/money-and-dates.ts`: `formatCents`, `parseReais`/`reaisInputSchema`, `formatIsoDate`, `formatPeriod`, `shiftPeriod`, `currentPeriod`, `todayIso`, `formatBasisPoints`, `parsePercent`. Never `new Date('YYYY-MM-DD')` for display, never floats for money.
- Status of a transaction comes from `transactionStatus` (`packages/shared`), never recomputed in a component.
- Use only fictitious data in tests, stories and screenshots (ADR 0019).

## Accessibility

- Every control has an accessible name; icon-only buttons have `aria-label`. Inputs have a visible `Label`.
- Visible focus (`focus-visible` ring). Dialogs and sheets trap focus and return it to the trigger. After an inline action changes a list, move focus somewhere sensible.
- Text contrast of 4.5:1 or more (3:1 for large text and UI parts), in light and dark.
- A "Pular para o conteúdo" skip link in the shell. Landmarks: `header`, `nav` (with `aria-label`), `main`.
- Respect `prefers-reduced-motion`.

## Tests (`apps/web/src/test/`)

- Page tests use `renderApp(path)` and `mockApi({...})`. Query by **role and accessible name**, then by label; avoid `closest(...)` and other structure-bound lookups in new tests.
- When markup changes (table to cards, native select to shadcn `Select`, inline form to `Sheet`), keep the accessible names and rewrite assertions around what the user sees, not the DOM shape.
- Radix components in jsdom: open them with `userEvent` on the trigger; `Select` options are found with `findByRole('option', { name })` after opening.

## Review checklist (before calling a UI change done)

1. `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
2. Screenshots at **360×800, 768×1024 and 1280×800** of each changed page, with the API and web dev servers running. Check: no horizontal scroll, 44 px targets on mobile, nothing hidden behind the tab bar, dark mode legible if touched.
3. Keyboard pass: Tab through the page, open and close every dialog, focus is always visible.
4. No template tells from the list above; one brand color; semantic colors only from tokens.
5. Copy is pt-BR, consistent verbs between button and toast.
