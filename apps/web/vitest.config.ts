import { defineProject, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Reuses vite.config.ts (React plugin, "@" alias) and adds the test settings.
export default mergeConfig(
  viteConfig,
  defineProject({
    test: {
      name: 'web',
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      env: { VITE_API_URL: 'http://api.test' },
      // Page tests that walk through several screens get close to the default 5s when the whole
      // suite runs on a busy machine; a stuck test still fails, just later.
      testTimeout: 15_000,
    },
  }),
);
