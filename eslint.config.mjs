// @ts-check
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        // Cada pacote tem seu tsconfig; o project service encontra o mais próximo de cada arquivo.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Front: código do navegador, com as regras de hooks e de fast refresh do React.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Componentes gerados pelo shadcn/ui exportam variantes junto com o componente.
    files: ['apps/web/src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Arquivos JS de configuração não fazem parte de nenhum tsconfig.
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  // Sempre por último: desliga regras de estilo que conflitam com o Prettier.
  eslintConfigPrettier,
);
