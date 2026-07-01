import { defineConfig, devices } from '@playwright/test'

// Lance le serveur Vite et teste le vrai jeu (rendu + UX).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Les tests e2e bootent en mode allégé (`&lite=1`) : pas de feuilles de sprites
  // 768²/1024² chargées → rendu en cercles → pages légères qui se chargent vite.
  // (Le seam teste l'ÉTAT, pas les pixels ; les captures manuelles gardent les
  // sprites complets sans lite.) `workers:1` : cette machine ne tient pas plusieurs
  // Chromium+SwiftShader concurrents (frame detached dès 2-3 workers) — mais grâce
  // au mode lite, même en série l'e2e est bien plus rapide qu'avant. Sur une
  // machine/CI plus costaude, remonter `workers` est sûr (pages déjà légères).
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    // Tests E2E toujours en headless (CI-friendly, rapide, reproductible).
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // WebGL logiciel (SwiftShader): le canvas Phaser rend en headless.
        launchOptions: {
          args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
        }
      }
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        launchOptions: {
          args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
        }
      }
    }
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
})
