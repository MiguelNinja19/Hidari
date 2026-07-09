import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Normaliza root no Windows (evita falha "reading 'config'" com drive em minúscula).
const root = fileURLToPath(new URL('./', import.meta.url))

export default defineConfig({
  root,
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
