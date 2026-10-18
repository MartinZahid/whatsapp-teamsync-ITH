import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// El content script debe ser un solo archivo clásico (IIFE), porque Chrome lo
// inyecta como script normal y no admite imports de módulos.
export default defineConfig({
  root: here,
  resolve: {
    alias: { '@shared': resolve(here, '../shared') }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome110',
    lib: {
      entry: resolve(here, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'WTSPanel',
      fileName: () => 'content.js'
    }
  }
})
