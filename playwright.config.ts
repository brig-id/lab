import { defineConfig, devices } from "@playwright/test";

// The pages as Cloudflare serves them (`wrangler dev`: the same static
// assets and the same public/_headers), and a passkey from Chrome's virtual
// authenticator. `localhost` is a secure context, so WebAuthn works there.
export const LAB = "http://localhost:8787";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: LAB, trace: "on-first-retry" },
  // A passkey needs a virtual authenticator, which Playwright only has for
  // Chromium.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec wrangler dev --port 8787 --ip 127.0.0.1",
    url: `${LAB}/robots.txt`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
