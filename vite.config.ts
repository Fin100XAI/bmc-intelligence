import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { pilotApiPlugin } from './scripts/pilot-api-plugin.js'

// https://vite.dev/config/
export default defineConfig({
  // pilotApiPlugin only registers dev-server middleware (configureServer),
  // so it is inert in a production build - there is no real backend there.
  plugins: [react(), tailwindcss(), pilotApiPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        // Split the heaviest third-party dependencies so route chunks stay small.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('@tanstack')) return 'vendor-query'
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react'
          return undefined
        },
      },
    },
  },
})
