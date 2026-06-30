import { defineConfig, devices } from '@playwright/test'

// Lance le serveur Vite et teste le vrai jeu (rendu + UX).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Le jeu charge plusieurs feuilles de sprites 768² rendues en WebGL logiciel
  // (SwiftShader) ; plusieurs onglets headless en parallèle saturent la mémoire
  // du renderer (frame detached) — surtout le test « déterminisme » qui recharge
  // toute la partie deux fois dans le même onglet. On sérialise l'e2e (le vrai
  // jeu, 1 onglet, charge ces textures sans souci). À ré-évaluer si on allège les
  // textures runtime (cellules 96px) → on pourra restaurer le parallélisme.
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
