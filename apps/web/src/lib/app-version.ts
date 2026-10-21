declare const __APP_VERSION__: string;

/** The version in production (ADR 0050 note), set at build time from the root package.json. */
export const APP_VERSION = __APP_VERSION__;

/** Its GitHub release, where what changed is written. */
export const releaseUrl = (version: string) =>
  `https://github.com/diegollelis/financas-app/releases/tag/v${version}`;
