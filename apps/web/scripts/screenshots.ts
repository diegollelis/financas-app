/**
 * Screenshots of the main pages at the three review widths of the financas-ui skill (ADR 0036),
 * plus two automatic checks at phone width: horizontal scroll and touch targets under 44px.
 *
 * Needs the API (:3333) and the web app (:5173) running locally. Signs in as a fictitious local
 * user (created on the first run) and adds sample transactions to the current month when it has
 * none, so the pages show real content. Never point this at production.
 *
 *   pnpm --filter @financas/web screenshots            → apps/web/.screenshots/
 *   pnpm --filter @financas/web screenshots -- painel  → only pages whose name contains "painel"
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type APIRequestContext, type Page } from 'playwright';

const WEB = 'http://localhost:5173';
const API = 'http://localhost:3333';
const OUT = new URL('../.screenshots/', import.meta.url);

// Fictitious data only (ADR 0019). Lives only in the local development database.
const demoUser = {
  name: 'Maria Exemplo',
  email: 'capturas@example.com',
  // Fictitious and local-only; gitleaks flags any password literal of this entropy.
  password: 'senha-de-capturas-123', // gitleaks:allow
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

async function signIn(api: APIRequestContext) {
  const headers = { Origin: WEB };
  const signedIn = await api.post(`${API}/api/auth/sign-in/email`, {
    headers,
    data: { email: demoUser.email, password: demoUser.password },
  });
  if (signedIn.ok()) return;
  const signedUp = await api.post(`${API}/api/auth/sign-up/email`, { headers, data: demoUser });
  if (!signedUp.ok()) throw new Error(`Could not sign in or sign up: ${signedUp.status()}`);
}

async function seed(api: APIRequestContext, workspaceId: string, period: string) {
  const base = `${API}/api/workspaces/${workspaceId}`;
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
      settledAt: null,
    },
    {
      type: 'DEBIT',
      description: 'Mercado',
      categoryId: pick('DEBIT', 1),
      amountCents: 64035,
      dueDate: day(3),
      settledAt: day(3),
    },
    {
      type: 'DEBIT',
      description: 'Energia elétrica',
      categoryId: pick('DEBIT', 2),
      amountCents: 18990,
      dueDate: day(1),
      settledAt: null,
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

async function main() {
  const filter = process.argv[2];
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const period = currentPeriod();

  const auth = await browser.newContext();
  await signIn(auth.request);
  const workspaces = (await (
    await auth.request.get(`${API}/api/workspaces`)
  ).json()) as Workspace[];
  const workspaceId = workspaces.find((w) => w.isPersonal)!.id;
  await seed(auth.request, workspaceId, period);
  const storageState = await auth.storageState();
  await auth.close();

  const pages = [
    { name: 'entrar', path: '/entrar', signedIn: false },
    { name: 'inicio', path: '/', signedIn: true },
    { name: 'espaco', path: `/espacos/${workspaceId}`, signedIn: true },
    { name: 'painel', path: `/espacos/${workspaceId}/painel`, signedIn: true },
    { name: 'lancamentos', path: `/espacos/${workspaceId}/lancamentos`, signedIn: true },
    { name: 'orcamento', path: `/espacos/${workspaceId}/orcamento`, signedIn: true },
    { name: 'categorias', path: `/espacos/${workspaceId}/categorias`, signedIn: true },
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
      const page = await (target.signedIn ? context : guest).newPage();
      await page.goto(`${WEB}${target.path}`, { waitUntil: 'networkidle' });
      const suffix = dark ? '-escuro' : '';
      const file = new URL(`${target.name}-${viewport.name}${suffix}.png`, OUT);
      await page.screenshot({ path: fileURLToPath(file), fullPage: true });
      if (viewport.width < 768 && !dark) {
        const problems = await phoneChecks(page);
        problemCount += problems.length;
        for (const problem of problems)
          console.log(`  ${target.name} (${viewport.width}px): ${problem}`);
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
}

await main();
