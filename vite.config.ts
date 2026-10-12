import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { pilotApiPlugin } from './scripts/pilot-api-plugin.js'
import { statePersistencePlugin } from './scripts/state-persistence-plugin.js'

// https://vite.dev/config/
export default defineConfig({
  // pilotApiPlugin and statePersistencePlugin only register dev-server
  // middleware (configureServer), so both are inert in a production build -
  // there is no real backend there.
  plugins: [react(), tailwindcss(), pilotApiPlugin(), statePersistencePlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // No chunk may exceed 800 kB. The Marathi catalogue (several MB) loads on
    // demand, in its own chunks - see `src/i18n/index.ts`.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        /*
         * Vendor and catalogue chunks (rolldown `codeSplitting` groups).
         *
         * A group captures the modules it matches AND, by default, their
         * dependencies. That is why the order (`priority`, highest first)
         * matters: React must be claimed by `vendor-react` before the charts
         * group runs, or recharts takes React (and the small libraries the
         * shell also uses) into `vendor-charts`, which then becomes a static
         * import of the entry and puts the whole charting library on the
         * sign-in page's critical path.
         */
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              priority: 60,
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-is|use-sync-external-store)[\\/]/,
            },
            { name: 'vendor-ui', priority: 55, test: /[\\/]node_modules[\\/](clsx|tailwind-merge|zustand)[\\/]/ },
            { name: 'vendor-router', priority: 50, test: /[\\/]node_modules[\\/](react-router|react-router-dom)[\\/]/ },
            { name: 'vendor-query', priority: 50, test: /[\\/]node_modules[\\/]@tanstack[\\/]/ },
            { name: 'vendor-map', priority: 40, test: /[\\/]node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/ },
            { name: 'vendor-graph', priority: 40, test: /[\\/]node_modules[\\/]cytoscape/ },
            { name: 'vendor-charts', priority: 30, test: /[\\/]node_modules[\\/](recharts|d3-[\w-]+|victory-vendor)[\\/]/ },
            // The Marathi catalogue: a single dynamic import, split into
            // chunks of ten parts (~0.5 MB each) so no file is multi-megabyte
            // and the browser fetches them in parallel. The parts import
            // nothing, so capturing them pulls in no other module.
            ...Array.from({ length: 10 }, (_, n) => ({
              name: `i18n-mr-${n}`,
              priority: 10,
              test: new RegExp(`[\\\\/]src[\\\\/]i18n[\\\\/]mr[\\\\/]part-${n}\\d\\.ts$`),
            })),
          ],
        },
      },
    },
  },
})
