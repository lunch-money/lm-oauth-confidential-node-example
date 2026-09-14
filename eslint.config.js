import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: { ...tseslint.configs.recommended.rules, 'no-undef': 'off' },
  },
  {
    files: ['src/oauth/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'hono',
                'hono/*',
                'react',
                'react/*',
                'vite',
                'vite/*',
                'tailwindcss',
                'tailwindcss/*',
                '*cookie*',
              ],
              message:
                'Keep framework, HTML, and cookie concerns in src/scaffolding/.',
            },
            {
              group: ['../scaffolding/*', '../scaffolding/**'],
              message:
                'The OAuth teaching core must not depend on scaffolding.',
            },
          ],
        },
      ],
    },
  },
]
