/**
 * Screenshots of the main pages at the three review widths of the financas-ui skill (ADR 0036),
 * plus two automatic checks at phone width: horizontal scroll and touch targets under 44px.
 *
 * Needs the API (:3333), the web app (:5173) and Mailpit (:8025) running locally. Signs in as a fictitious local
 * user (created on the first run) and adds sample transactions to the current month when it has
 * none, so the pages show real content. Never point this at production.
 *
 *   pnpm --filter @financas/web screenshots            → apps/web/.screenshots/
 *   pnpm --filter @financas/web screenshots -- painel  → only pages whose name contains "painel"
 */
import { mkdirSync } from 'node:fs';
import { TERMS_VERSION } from '@financas/shared';
import { fileURLToPath } from 'node:url';
import { chromium, type APIRequestContext, type Page } from 'playwright';

const WEB = 'http://localhost:5173';
const API = 'http://localhost:3333';
const MAILPIT = 'http://localhost:8025';
const OUT = new URL('../.screenshots/', import.meta.url);

// Fictitious data only (ADR 0019). Lives only in the local development database.
const demoUser = {
  name: 'Maria Exemplo',
  email: 'capturas@example.com',
  // Fictitious and local-only; gitleaks flags any password literal of this entropy.
  password: 'senha-de-capturas-123', // gitleaks:allow
  acceptTerms: true,
};

const viewports = [
  { name: 'celular', width: 360, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

const MIN_TARGET = 44;

type Workspace = { id: string; isPersonal: boolean };
type Category = { id: string; name: string; type: 'CREDIT' | 'DEBIT'; archived: boolean };

function currentPeriod(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7);
}

/** The confirmation link of the newest e-mail Mailpit caught for the demo user. */
async function verificationLink(api: APIRequestContext): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await api.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${demoUser.email}`)}`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string; Subject: string }[] };
    const message = messages.find((m) => m.Subject === 'Confirme seu e-mail no Finanças');
    if (message) {
      const full = (await (await api.get(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as {
        Text: string;
      };
      const link = /https?:\/\/\S+/.exec(full.Text)?.[0];
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('No confirmation e-mail in Mailpit for the demo user');
}

/**
 * Signs in as the demo user, creating it on the first run. A password needs a verified e-mail
 * (ADR 0022): when the API says it is not, the link it e-mails to Mailpit is opened, as a person
 * would, and that already signs in.
 */
async function signIn(api: APIRequestContext) {
  const headers = { Origin: WEB };
  const signInOnce = () =>
    api.post(`${API}/api/auth/sign-in/email`, {
      headers,
      data: { email: demoUser.email, password: demoUser.password },
    });
  let signedIn = await signInOnce();
  if (signedIn.ok()) return;
  if (signedIn.status() === 401) {
    const signedUp = await api.post(`${API}/api/auth/sign-up/email`, { headers, data: demoUser });
    if (!signedUp.ok()) throw new Error(`Could not sign up: ${signedUp.status()}`);
    signedIn = await signInOnce();
  }
  if (signedIn.status() !== 403) throw new Error(`Could not sign in: ${signedIn.status()}`);
  // Not verified: this sign-in has just e-mailed a fresh link.
  const verified = await api.get(await verificationLink(api), { maxRedirects: 0 });
  if (verified.status() !== 302) throw new Error(`Could not verify: ${verified.status()}`);
  signedIn = await signInOnce();
  if (!signedIn.ok()) throw new Error(`Could not sign in after verifying: ${signedIn.status()}`);
}

/**
 * Accepts the terms in force (ADR 0041), as the acceptance screen would: a demo user created
 * before them, or before a new version, would see only that screen on every page.
 */
async function acceptTerms(api: APIRequestContext) {
  const accepted = await api.post(`${API}/api/me/terms`, {
    headers: { Origin: WEB },
    data: { version: TERMS_VERSION },
  });
  if (!accepted.ok()) throw new Error(`Could not accept the terms: ${accepted.status()}`);
}

/** The competência `months` before `period` ('2026-01', 1 → '2025-12'). */
function monthsBefore(period: string, months: number): string {
  const [year, month] = period.split('-').map(Number);
  const index = year! * 12 + month! - 1 - months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * Sample transactions for one competência, if it has none. Past months are all settled, and
 * the variable debits change a little from month to month, so the analysis chart has a shape.
 */
async function seed(api: APIRequestContext, workspaceId: string, period: string, monthsAgo = 0) {
  const base = `${API}/api/workspaces/${workspaceId}`;
  const vary = (cents: number) => Math.round(cents * (1 + (((monthsAgo * 7) % 5) - 2) / 10));
  const pending = (date: string) => (monthsAgo > 0 ? date : null);
  const existing = (await (
    await api.get(`${base}/transactions?period=${period}`)
  ).json()) as unknown[];
  if (existing.length > 0) return;

  const categories = (await (await api.get(`${base}/categories`)).json()) as Category[];
  const pick = (type: Category['type'], index: number) =>
    categories.filter((c) => c.type === type && !c.archived)[index]!.id;
  const day = (d: number) => `${period}-${String(d).padStart(2, '0')}`;
  const samples = [
    {
      type: 'CREDIT',
      description: 'Salário',
      categoryId: pick('CREDIT', 0),
      amountCents: 520000,
      dueDate: day(5),
      settledAt: day(5),
    },
    {
      type: 'DEBIT',
      description: 'Aluguel',
      categoryId: pick('DEBIT', 0),
      amountCents: 180000,
      dueDate: day(10),
      settledAt: pending(day(10)),
    },
    {
      type: 'DEBIT',
      description: 'Mercado',
      categoryId: pick('DEBIT', 1),
      amountCents: vary(64035),
      dueDate: day(3),
      settledAt: day(3),
    },
    {
      type: 'DEBIT',
      description: 'Energia elétrica',
      categoryId: pick('DEBIT', 2),
      amountCents: vary(18990),
      dueDate: day(1),
      settledAt: pending(day(1)),
    },
  ];
  for (const data of samples) {
    const created = await api.post(`${base}/transactions`, {
      headers: { Origin: WEB },
      data: { ...data, period },
    });
    if (!created.ok())
      throw new Error(`Could not create a sample transaction: ${created.status()}`);
  }
}

/**
 * A monthly bill and an installment purchase for the "Recorrências" page (ADR 0038), once:
 * created only when the workspace has none.
 */
async function seedSeries(api: APIRequestContext, workspaceId: string, period: string) {
  const base = `${API}/api/workspaces/${workspaceId}`;
  const headers = { Origin: WEB };
  const recurrences = (await (await api.get(`${base}/recurrences`)).json()) as unknown[];
  const plans = (await (await api.get(`${base}/installments`)).json()) as unknown[];
  const categories = (await (await api.get(`${base}/categories`)).json()) as Category[];
  const debit = (index: number) =>
    categories.filter((c) => c.type === 'DEBIT' && !c.archived)[index]!.id;
  if (recurrences.length === 0) {
    const created = await api.post(`${base}/recurrences`, {
      headers,
      data: {
        type: 'DEBIT',
        description: 'Internet',
        categoryId: debit(2),
        amountCents: 9990,
        dueDay: 15,
        startPeriod: period,
      },
    });
    if (!created.ok()) throw new Error(`Could not create a sample recurrence: ${created.status()}`);
  }
  if (plans.length === 0) {
    const created = await api.post(`${base}/installments`, {
      headers,
      data: {
        type: 'DEBIT',
        description: 'Notebook',
        categoryId: debit(1),
        installments: 12,
        amountCents: 360000,
        amountIs: 'TOTAL',
        firstPeriod: monthsBefore(period, 2),
        dueDay: 20,
      },
    });
    if (!created.ok()) throw new Error(`Could not create a sample plan: ${created.status()}`);
  }
}

/** Problems a phone user would hit: sideways scrolling and controls too small for a finger. */
async function phoneChecks(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const problems: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) {
      problems.push(
        `rolagem horizontal: ${root.scrollWidth}px de conteúdo em ${root.clientWidth}px`,
      );
    }
    const controls = document.querySelectorAll<HTMLElement>(
      'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab]',
    );
    for (const el of controls) {
      const box = el.getBoundingClientRect();
      // Visually hidden (e.g. the skip link until focused): not a target anyone taps.
      if (box.width === 0 || box.height === 0 || el.matches('.sr-only')) continue;
      // Hidden from everyone (e.g. the native select Radix keeps for forms).
      if (el.closest('[aria-hidden="true"]')) continue;
      // A link inside a sentence (the terms in the sign-up checkbox): WCAG 2.5.8 exempts inline
      // targets, whose size the line of text sets. Links standing alone still need 44px.
      if (el.matches('a') && getComputedStyle(el).display === 'inline') continue;
      // A small box inside a big label (the checkboxes): the label is what the finger taps.
      const label = el.closest('label')?.getBoundingClientRect();
      if (label && label.height >= min && label.width >= min) continue;
      if (box.height < min || box.width < min) {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName)
          .trim()
          .slice(0, 40);
        problems.push(`alvo pequeno (${Math.round(box.width)}x${Math.round(box.height)}): ${name}`);
      }
    }
    return problems;
  }, MIN_TARGET);
}

/** axe-core, injected into each page: the automated part of an accessibility review. */
const AXE_SOURCE = fileURLToPath(import.meta.resolve('axe-core/axe.min.js'));

/**
 * WCAG 2.1 A and AA violations axe finds on the page, one line per rule and element. Run in both
 * themes, since color contrast changes with them. axe does not measure the contrast of borders
 * (WCAG 1.4.11): the palette test covers the tokens that draw them.
 */
async function accessibilityChecks(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE_SOURCE });
  return page.evaluate(async () => {
    type AxeResult = {
      violations: { id: string; help: string; nodes: { target: string[] }[] }[];
    };
    const axe = (window as unknown as { axe: { run: (options: object) => Promise<AxeResult> } })
      .axe;
    const result = await axe.run({
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return result.violations.flatMap((violation) =>
      violation.nodes.map(
        (node) => `axe ${violation.id} (${violation.help}): ${node.target.join(' ')}`,
      ),
    );
  });
}

async function main() {
  const filter = process.argv[2];
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const period = currentPeriod();

  const auth = await browser.newContext();
  await signIn(auth.request);
  await acceptTerms(auth.request);
  const workspaces = (await (
    await auth.request.get(`${API}/api/workspaces`)
  ).json()) as Workspace[];
  const workspaceId = workspaces.find((w) => w.isPersonal)!.id;
  // This month and the five before it: the analysis page shows the last 6 months.
  for (let monthsAgo = 0; monthsAgo < 6; monthsAgo++) {
    await seed(auth.request, workspaceId, monthsBefore(period, monthsAgo), monthsAgo);
  }
  await seedSeries(auth.request, workspaceId, period);
  // A second workspace, to copy categories into from the personal one (ADR 0048); "Pet" is new
  // there, the defaults already exist. A repeated name answers 409, which is fine here.
  let houseId = workspaces.find((w) => !w.isPersonal)?.id;
  if (!houseId) {
    const created = await auth.request.post(`${API}/api/workspaces`, { data: { name: 'Casa' } });
    houseId = ((await created.json()) as Workspace).id;
  }
  await auth.request.post(`${API}/api/workspaces/${workspaceId}/categories`, {
    data: { name: 'Pet', type: 'DEBIT' },
  });
  const storageState = await auth.storageState();
  await auth.close();

  const pages = [
    { name: 'entrar', path: '/entrar', signedIn: false },
    { name: 'cadastro', path: '/cadastro', signedIn: false },
    { name: 'termos', path: '/termos', signedIn: false },
    // "/" is not a page: it opens the last workspace used (ADR 0036). The switcher is captured open.
    {
      name: 'seletor-espaco',
      path: `/espacos/${workspaceId}/painel`,
      signedIn: true,
      open: /^Trocar de espaço/,
      opens: 'menu' as const,
    },
    { name: 'espaco', path: `/espacos/${workspaceId}`, signedIn: true },
    { name: 'conta', path: '/conta', signedIn: true },
    { name: 'painel', path: `/espacos/${workspaceId}/painel`, signedIn: true },
    { name: 'lancamentos', path: `/espacos/${workspaceId}/lancamentos`, signedIn: true },
    {
      // The form, open: a sheet on the phone, a dialog from md.
      name: 'lancamentos-novo',
      path: `/espacos/${workspaceId}/lancamentos`,
      signedIn: true,
      open: /^Novo lançamento$/,
      opens: 'dialog' as const,
    },
    {
      // Its category picker: "Mais usadas" first; its own sheet on the phone, a popover from md.
      name: 'lancamentos-categoria',
      path: `/espacos/${workspaceId}/lancamentos`,
      signedIn: true,
      open: /^Novo lançamento$/,
      opens: 'dialog' as const,
      combobox: 'Categoria',
    },
    {
      // The month picker, opened away from this month (the dot shows beside the name).
      name: 'competencia-seletor',
      path: `/espacos/${workspaceId}/lancamentos?competencia=${monthsBefore(period, 14)}`,
      signedIn: true,
      open: /^Escolher competência/,
      opens: 'dialog' as const,
    },
    {
      // The budget is a dialog on the dashboard (ADR 0046).
      name: 'orcamento',
      path: `/espacos/${workspaceId}/painel`,
      signedIn: true,
      // "Definir orçamento" until the workspace has one (ADR 0047), "Editar orçamento" after.
      open: /^(Editar orçamento|Definir orçamento)$/,
      opens: 'dialog' as const,
    },
    {
      // An application to a saving destination: type and category fixed (ADR 0047).
      name: 'painel-aplicar',
      path: `/espacos/${workspaceId}/painel`,
      signedIn: true,
      open: /^Aplicar em Investimentos$/,
      opens: 'dialog' as const,
    },
    { name: 'categorias', path: `/espacos/${workspaceId}/categorias`, signedIn: true },
    {
      name: 'categorias-nova',
      path: `/espacos/${workspaceId}/categorias`,
      signedIn: true,
      open: /^Nova categoria$/,
      opens: 'dialog' as const,
    },
    {
      // In the shared workspace, copying from the personal one (ADR 0048).
      name: 'categorias-copiar',
      path: `/espacos/${houseId}/categorias`,
      signedIn: true,
      open: /^Copiar de outro espaço$/,
      opens: 'dialog' as const,
    },
    { name: 'recorrencias', path: `/espacos/${workspaceId}/recorrencias`, signedIn: true },
    { name: 'pessoas', path: `/espacos/${workspaceId}/pessoas`, signedIn: true },
    { name: 'importar', path: `/espacos/${workspaceId}/importar`, signedIn: true },
    { name: 'analise', path: `/espacos/${workspaceId}/analise`, signedIn: true },
    {
      // On the phone the filters are behind a button; from md they are on the page.
      name: 'analise-filtros',
      path: `/espacos/${workspaceId}/analise`,
      signedIn: true,
      open: /^Filtros$/,
      opens: 'dialog' as const,
      phoneOnly: true,
    },
    {
      // The largest category, open month by month.
      name: 'analise-categoria',
      path: `/espacos/${workspaceId}/analise`,
      signedIn: true,
      open: /do total/,
      opens: 'dialog' as const,
    },
  ].filter((p) => !filter || p.name.includes(filter));

  // Light at every width; dark (the device's preference, theme "Sistema") at phone and desktop.
  // The phone checks run once, in light: sizes do not change with the theme.
  const passes = [
    ...viewports.map((viewport) => ({ viewport, dark: false })),
    ...viewports
      .filter((viewport) => viewport.name !== 'tablet')
      .map((viewport) => ({ viewport, dark: true })),
  ];

  let problemCount = 0;
  let a11yCount = 0;
  for (const { viewport, dark } of passes) {
    const colorScheme = dark ? 'dark' : 'light';
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.width < 768 ? 2 : 1,
      storageState,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      colorScheme,
    });
    const guest = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme,
    });
    for (const target of pages) {
      if (target.phoneOnly && viewport.width >= 768) continue;
      const page = await (target.signedIn ? context : guest).newPage();
      await page.goto(`${WEB}${target.path}`, { waitUntil: 'networkidle' });
      if (target.open && target.opens) {
        await page.getByRole('button', { name: target.open }).first().click();
        await page.getByRole(target.opens).waitFor();
        // Lets the opening animation finish.
        await page.waitForTimeout(400);
      }
      if ('combobox' in target && target.combobox) {
        await page.getByRole('combobox', { name: target.combobox }).click();
        await page.getByRole('option').first().waitFor();
        await page.waitForTimeout(400);
      }
      const suffix = dark ? '-escuro' : '';
      const file = new URL(`${target.name}-${viewport.name}${suffix}.png`, OUT);
      // An open dialog is fixed to the screen: capture the viewport, not the whole page.
      await page.screenshot({ path: fileURLToPath(file), fullPage: !target.open });
      if (viewport.width < 768 && !dark) {
        const problems = await phoneChecks(page);
        problemCount += problems.length;
        for (const problem of problems)
          console.log(`  ${target.name} (${viewport.width}px): ${problem}`);
      }
      // Accessibility, on the phone in each theme: the layout matters less than the colors.
      if (viewport.width < 768) {
        const violations = await accessibilityChecks(page);
        a11yCount += violations.length;
        for (const violation of violations)
          console.log(`  ${target.name} (${colorScheme}): ${violation}`);
      }
      await page.close();
    }
    await context.close();
    await guest.close();
  }
  await browser.close();

  console.log(`\nCapturas em ${fileURLToPath(OUT)}`);
  console.log(
    problemCount === 0 ? 'Nenhum problema no celular.' : `${problemCount} problema(s) no celular.`,
  );
  console.log(
    a11yCount === 0
      ? 'Nenhuma violação de acessibilidade (axe, WCAG 2.1 AA).'
      : `${a11yCount} violação(ões) de acessibilidade (axe, WCAG 2.1 AA).`,
  );
}

await main();
