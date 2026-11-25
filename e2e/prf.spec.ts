import { type BrowserContext, expect, type Page, test } from "@playwright/test";

/** A passkey without hardware: Chrome's virtual authenticator. */
async function virtualAuthenticator(
  context: BrowserContext,
  page: Page,
  hasPrf: boolean,
) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf,
    },
  });
}

test("the pages are not indexed and load nothing from elsewhere", async ({
  page,
  request,
}) => {
  const response = await request.get("/prf/");
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
  expect(response.headers()["content-security-policy"]).toContain(
    "default-src 'none'",
  );
  expect(await (await request.get("/robots.txt")).text()).toContain(
    "Disallow: /",
  );
  await page.goto("/prf/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("a passkey with PRF: measured, then a field encrypted and read back", async ({
  context,
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/prf/");
  await virtualAuthenticator(context, page, true);
  await expect(page.locator("#device")).toContainText("Chrome");

  await page.getByRole("button", { name: "Create a test passkey" }).click();
  await expect(page.locator("#create-status")).toHaveText(
    "Created. Now sign in with it.",
  );
  await expect(page.locator("#create-enabled")).toHaveText("yes");
  await expect(page.locator("#attachment")).toHaveText("platform");

  await page
    .getByRole("button", { name: "Sign in with the test passkey" })
    .click();
  await expect(page.locator("#get-output")).toContainText("yes (32 bytes");

  // Twice: whether or not the output came at creation, the second sign-in
  // has one to compare with.
  await page
    .getByRole("button", { name: "Sign in with the test passkey" })
    .click();
  await expect(page.locator("#get-stable")).toHaveText("yes");
  const line = page.locator("#result");
  await expect(line).toContainText("create: prf enabled yes");
  await expect(line).toContainText("get: output yes, stable yes");
  await expect(line).toContainText("Chrome");
  // The line holds no secret: no long run of hex or base64.
  expect(await line.textContent()).not.toMatch(/[A-Za-z0-9_-]{20,}/);

  await page.getByLabel("A field to encrypt").fill("Grace Hopper");
  await page.getByRole("button", { name: "Encrypt it" }).click();
  await expect(page.locator("#wrapped")).toContainText("(61 bytes)");
  await expect(page.locator("#opened")).toHaveText("not yet");
  await page.getByRole("button", { name: "Sign in and decrypt it" }).click();
  await expect(page.locator("#opened")).toHaveText(
    "Grace Hopper — the same as written",
  );
  expect(errors).toEqual([]);
});

test("a passkey without PRF says so", async ({ context, page }) => {
  await page.goto("/prf/");
  await virtualAuthenticator(context, page, false);
  await page.getByRole("button", { name: "Create a test passkey" }).click();
  await expect(page.locator("#create-status")).toHaveText(
    "Created. Now sign in with it.",
  );
  await expect(page.locator("#create-enabled")).toHaveText("no");
  await expect(page.locator("#create-output")).toHaveText("no");
  await page
    .getByRole("button", { name: "Sign in with the test passkey" })
    .click();
  await expect(page.locator("#get-output")).toHaveText("no");
  await expect(page.locator("#result")).toContainText(
    "create: prf enabled no, output no · get: output no, stable n/a",
  );
  await expect(page.getByRole("button", { name: "Encrypt it" })).toBeDisabled();
});
