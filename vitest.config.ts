import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * vitest.config.ts
 *
 * Separate from `vite.config.ts` deliberately: the dev-only API plugins
 * there (`pilotApiPlugin`, `statePersistencePlugin`) register Vite
 * `configureServer` middleware that has no meaning under Vitest's Node test
 * runner, and pulling them in would be dead weight at best. Shares the same
 * `@` alias and React/JSX handling as the app build so a test imports source
 * exactly the way the application does.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
