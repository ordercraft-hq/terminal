import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf-8')
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(`v${packageJson.version}`),
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8448',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://127.0.0.1:8448',
        ws: true,
        changeOrigin: true,
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'react-vendor';
            }
            if (id.includes('lightweight-charts') || id.includes('fancy-canvas')) {
              return 'chart-vendor';
            }
            if (id.includes('lucide-react')) {
              return 'icons-vendor';
            }
          }
        },
      },
    },
  },
})
