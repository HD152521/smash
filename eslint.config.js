import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // supabase/functions 는 Deno 에서 돈다 — npm/Deno import 문법이 달라 앱 린터로 볼 수 없다
  { ignores: ['dist', 'coverage', 'supabase/.temp', 'supabase/functions'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 디버그 잔재가 커밋되는 걸 막는다 (code-review 체크리스트 항목)
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // CLI 스크립트는 콘솔 출력이 곧 UI 다
    files: ['scripts/**/*.ts', '*.config.{ts,js}'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
)
