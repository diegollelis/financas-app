import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read from disk: Vitest turns CSS imports into empty modules, even with ?raw. Here, under
// scripts/, the Node types are available (src/ is browser code).
const css = readFileSync(join(import.meta.dirname, '../src/index.css'), 'utf8');

/**
 * The palette's contrast, kept by a test (ADR 0043): every token pair the interface puts text
 * on, in both themes, reaches WCAG AA (4.5:1 for text, 3:1 for UI parts such as the focus ring
 * and money fills). A new color that fails here gets darker (or lighter in dark), not an
 * exception.
 */

/** The `--name: #rrggbb` tokens of one block (`:root` or `.dark`), with var() resolved. */
function tokens(selector: ':root' | '.dark'): Record<string, string> {
  const block = new RegExp(`^${selector.replace('.', '\\.')} \\{([^}]*)\\}`, 'm').exec(css)?.[1];
  if (!block) throw new Error(`No ${selector} block in index.css`);
  const values: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    values[name!] = value!.trim();
  }
  for (const [name, value] of Object.entries(values)) {
    const reference = /^var\(--([a-z0-9-]+)\)$/.exec(value)?.[1];
    if (reference) values[name] = values[reference]!;
  }
  return values;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255]
    .map((channel) => {
      const v = channel / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** Text on its background: 4.5:1. */
const textPairs: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'],
  ['primary', 'background'],
  ['primary', 'card'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['destructive', 'background'],
  ['destructive', 'card'],
  ['success', 'background'],
  ['success', 'card'],
  ['success', 'success-muted'],
  ['warning', 'card'],
  ['warning', 'warning-muted'],
  ['sidebar-foreground', 'sidebar'],
  ['sidebar-primary-foreground', 'sidebar-primary'],
  ['sidebar-accent-foreground', 'sidebar-accent'],
];

/** Parts of the interface that are not text (focus ring, money fills): 3:1. */
const uiPairs: [string, string][] = [
  ['ring', 'background'],
  ['ring', 'card'],
  ['credit', 'card'],
  ['debit', 'card'],
];

/**
 * The brand's official colors (ADR 0043, the approved palette): main, neutrals, semantic,
 * state, and the dark surfaces.
 */
const OFFICIAL = new Set([
  '#0066ff',
  '#00c2ff',
  '#00e6b8',
  '#0a1f3d',
  '#f8fafc',
  '#ffffff',
  '#e2e8f0',
  '#0f172a',
  '#64748b',
  '#94a3b8',
  '#16a34a',
  '#ef4444',
  '#f59e0b',
  '#8b5cf6',
  '#22c55e',
  '#dc2626',
  '#3b82f6',
  '#6b7280',
  '#11284a',
  '#1e3a8a',
  '#1f3b6d',
]);

/**
 * Semantic tokens derived from an official color, for contrast or as a fill (ADR 0043, "Tokens
 * derivados"). They are not new brand colors: each one says where it comes from and why. A
 * color in index.css that is in neither list fails the test below.
 */
const DERIVED: Record<string, string> = {
  '#f1f5f9': 'between #f8fafc and #e2e8f0: a fill that shows on the background and on cards',
  '#5b6b82': '#64748b, darker: 4.5:1 on the muted fill',
  '#b91c1c': '#dc2626, darker: 4.5:1 on the destructive button fill',
  '#15803d': '#16a34a, darker: success as text',
  '#b45309': '#f59e0b, darker: warning as text',
  '#dcfce7': '#16a34a, light tint: success and credit fill',
  '#fef3c7': '#f59e0b, light tint: warning fill',
  '#fee2e2': '#ef4444, light tint: debit fill',
  '#4d94ff': '#0066ff, lighter: primary on navy',
  '#f87171': '#ef4444, lighter: 4.5:1 on the navy surface',
  '#0f3b2a': '#16a34a, dark tint: success and credit fill on navy',
  '#3a2a0c': '#f59e0b, dark tint: warning fill on navy',
  '#3b1520': '#ef4444, dark tint: debit fill on navy',
  '#2a78d6': 'chart series 1 (ADR 0032)',
  '#eb6834': 'chart series 2 (ADR 0032)',
  '#1baf7a': 'chart series 3 (ADR 0032)',
  '#3987e5': 'chart series 1, dark (ADR 0032)',
  '#d95926': 'chart series 2, dark (ADR 0032)',
  '#199e70': 'chart series 3, dark (ADR 0032)',
};

describe('palette origin', () => {
  it('uses only official colors and registered derived tokens', () => {
    const used = new Set(css.match(/#[0-9a-fA-F]{6}\b/g)?.map((hex) => hex.toLowerCase()));
    const unknown = [...used].filter((hex) => !OFFICIAL.has(hex) && !(hex in DERIVED));
    expect(unknown).toEqual([]);
  });

  it('has no derived token left unused', () => {
    const unused = Object.keys(DERIVED).filter((hex) => !css.toLowerCase().includes(hex));
    expect(unused).toEqual([]);
  });

  it('keeps colors out of the components: only index.css has them', () => {
    const src = join(import.meta.dirname, '../src');
    const offenders = (readdirSync(src, { recursive: true }) as string[])
      .filter((file) => /\.tsx?$/.test(file) && !/\.spec\.tsx?$/.test(file))
      .filter((file) => !file.replaceAll('\\', '/').endsWith('lib/theme.ts'))
      .filter((file) => /#[0-9a-fA-F]{6}\b/.test(readFileSync(join(src, file), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('gives the browser bar the background of each theme', () => {
    // lib/theme.ts repeats the value: the theme-color meta tag needs a literal color.
    const theme = readFileSync(join(import.meta.dirname, '../src/lib/theme.ts'), 'utf8');
    expect(theme).toContain(`light: '${tokens(':root').background}'`);
    expect(theme).toContain(`dark: '${tokens('.dark').background}'`);
  });
});

describe.each([':root', '.dark'] as const)('palette contrast in %s', (selector) => {
  const values = tokens(selector);
  const ratio = (a: string, b: string) => {
    expect(values[a], `--${a}`).toMatch(/^#[0-9a-f]{6}$/);
    expect(values[b], `--${b}`).toMatch(/^#[0-9a-f]{6}$/);
    return contrast(values[a]!, values[b]!);
  };

  it.each(textPairs)('text --%s on --%s reaches 4.5:1', (text, background) => {
    expect(ratio(text, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(uiPairs)('--%s on --%s reaches 3:1', (part, background) => {
    expect(ratio(part, background)).toBeGreaterThanOrEqual(3);
  });
});
