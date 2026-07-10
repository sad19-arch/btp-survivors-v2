/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'
import { saveLayoutPlugin } from './tools/vite/saveLayoutPlugin'

// Base path: '/' en dev, '/btp-survivors/' en build pour déploiement sous sous-chemin.
const BASE = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base: BASE,
  plugins: [saveLayoutPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@content': fileURLToPath(new URL('./src/content', import.meta.url)),
      '@render': fileURLToPath(new URL('./src/render', import.meta.url)),
      '@input': fileURLToPath(new URL('./src/input', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@platform': fileURLToPath(new URL('./src/platform', import.meta.url))
    }
  },
  server: {
    port: 3000,
    host: true
  },
  build: {
    target: 'es2022',
    sourcemap: true
  },
  // Config Vitest (cœur testé sans navigateur).
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/content/**'],
      reporter: ['text', 'html']
    }
  }
})
