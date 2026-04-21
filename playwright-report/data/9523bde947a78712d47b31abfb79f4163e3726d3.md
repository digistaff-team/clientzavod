# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 0-critical-path.spec.js >> critical path: auth -> onboarding -> channels -> content generation
- Location: tests\e2e\specs\0-critical-path.spec.js:6:1

# Error details

```
TimeoutError: page.goto: Timeout 15000ms exceeded.
Call log:
  - navigating to "http://localhost:3015/auth.html?tg_login_token=mock-tg-login-token-xyz", waiting until "load"

```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | const { setupMocks } = require('../helpers/api');
  3  | const { interceptWindowOpen } = require('../helpers/setup');
  4  | const { SEL, TEST_TOKEN, TIMEOUT_REDIRECT } = require('../fixtures/constants');
  5  | 
  6  | test('critical path: auth -> onboarding -> channels -> content generation', async ({ page }) => {
  7  |   await interceptWindowOpen(page);
  8  |   await setupMocks(page, { setupStatus: 'pending' });
  9  | 
  10 |   // Step 1: Login via Telegram token
> 11 |   await page.goto(`/auth.html?tg_login_token=${TEST_TOKEN}`);
     |              ^ TimeoutError: page.goto: Timeout 15000ms exceeded.
  12 |   await page.waitForURL('**/setup.html', { timeout: TIMEOUT_REDIRECT });
  13 | 
  14 |   // Step 2: Onboarding - verify code
  15 |   await page.fill(SEL.VERIFY_CODE_INPUT, '123456');
  16 |   await page.click(SEL.VERIFY_CODE_BTN);
  17 |   await page.waitForSelector(`${SEL.VERIFY_STATUS}:has-text("✅")`);
  18 | 
  19 |   // Step 3: Save onboarding settings
  20 |   await expect(page.locator(SEL.SAVE_BTN)).toBeEnabled();
  21 |   await page.click(SEL.SAVE_BTN);
  22 |   await page.waitForURL('**/channels.html', { timeout: 5_000 });
  23 | 
  24 |   // Step 4: Verify channels.html loaded
  25 |   await page.waitForSelector('.channel-tab:not([style*="display: none"])', { state: 'visible' });
  26 |   await expect(page.locator(SEL.CHANNEL_PANEL('telegram'))).toBeVisible();
  27 | 
  28 |   // Step 5: Generate content
  29 |   await page.click(SEL.TELEGRAM_RUN_NOW_BTN);
  30 |   await expect(page.locator('.toast')).toBeVisible({ timeout: 5_000 });
  31 | });
  32 | 
```