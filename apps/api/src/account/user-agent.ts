/**
 * Browser and system names from a user-agent, enough to tell devices apart in "Aparelhos
 * conectados" (ADR 0049). Order matters: Edge and Opera also say "Chrome", and Chrome also says
 * "Safari"; Android also says "Linux", and iPadOS can say "Mac OS X".
 */
const browsers: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const systems: [RegExp, string][] = [
  [/Windows/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

export function describeUserAgent(userAgent: string | null | undefined): {
  browser: string;
  os: string;
} {
  const text = userAgent ?? '';
  return {
    browser: browsers.find(([pattern]) => pattern.test(text))?.[1] ?? 'Navegador desconhecido',
    os: systems.find(([pattern]) => pattern.test(text))?.[1] ?? 'Sistema desconhecido',
  };
}
