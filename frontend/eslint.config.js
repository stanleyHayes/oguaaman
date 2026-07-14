import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // React Router 7 route modules intentionally colocate data exports
      // (loader/action/ErrorBoundary…) with the route Component. These are part
      // of the framework contract, not accidental non-component exports.
      //
      // Severity is "warn", not "error": this is a dev-only Fast-Refresh hint
      // with no runtime/correctness impact. A few intentional files (the auth
      // context + its useAuth hook, the Adinkra icon registry) legitimately
      // export a helper alongside a component; we surface the hint without
      // blocking CI. Every correctness rule remains a hard error.
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: [
            'loader', 'action', 'ErrorBoundary', 'HydrateFallback',
            'meta', 'links', 'handle', 'shouldRevalidate',
            'clientLoader', 'clientAction',
          ],
        },
      ],
    },
  },
])
