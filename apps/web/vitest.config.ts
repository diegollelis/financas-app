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
    },
  }),
);
