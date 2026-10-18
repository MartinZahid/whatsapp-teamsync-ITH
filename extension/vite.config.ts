import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// Compila las páginas (popup y opciones) y el service worker.
// El content script se compila aparte con vite.content.config.ts.
export default defineConfig({
  root: here,
  base: './',
  publicDir: 'public',
  resolve: {
    alias: { '@shared': resolve(here, '../shared') }
  },
  server: {
    fs: { allow: ['..'] }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome110',
    rollupOptions: {
      input: {
        popup: resolve(here, 'popup/popup.html'),
        options: resolve(here, 'options/options.html'),
        'service-worker': resolve(here, 'src/background/service-worker.ts')
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
})
