# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 1-onboarding.spec.js >> Онбординг >> верный код активирует кнопку "Сохранить и продолжить"
- Location: tests\e2e\specs\1-onboarding.spec.js:37:3

# Error details

```
TimeoutError: page.goto: Timeout 15000ms exceeded.
Call log:
  - navigating to "http://localhost:3015/auth.html?tg_login_token=mock-tg-login-token-xyz", waiting until "load"

```

# Test source

```ts
  1  | const { TEST_TOKEN, TEST_CHAT_ID, TEST_TELEGRAM_ID, SEL, TIMEOUT_REDIRECT } = require('../fixtures/constants');
  2  | 
  3  | /**
  4  |  * Login via tg_login_token URL parameter
  5  |  * @param {import('@playwright/test').Page} page
  6  |  * @param {object} [options]
  7  |  * @param {boolean} [options.expectRedirectToSetup] expect redirect to setup
  8  |  */
  9  | async function loginWithToken(page, options = {}) {
  10 |   const { expectRedirectToSetup = false } = options;
  11 | 
> 12 |   await page.goto(`/auth.html?tg_login_token=${TEST_TOKEN}`);
     |              ^ TimeoutError: page.goto: Timeout 15000ms exceeded.
  13 | 
  14 |   if (expectRedirectToSetup) {
  15 |     await page.waitForURL('**/setup.html', { timeout: TIMEOUT_REDIRECT });
  16 |   } else {
  17 |     await page.waitForSelector(SEL.MAIN_CONTENT, { state: 'visible' });
  18 |   }
  19 | }
  20 | 
  21 | /**
  22 |  * Set auth in localStorage directly (faster, no auth flow)
  23 |  * @param {import('@playwright/test').Page} page
  24 |  */
  25 | async function setAuthInLocalStorage(page, chatId = TEST_CHAT_ID, telegramId = TEST_TELEGRAM_ID) {
  26 |   await page.goto('/');
  27 |   await page.evaluate(([cId, tId]) => {
  28 |     localStorage.setItem('chatId', cId);
  29 |     localStorage.setItem('telegramId', tId);
  30 |   }, [chatId, telegramId]);
  31 | }
  32 | 
  33 | module.exports = { loginWithToken, setAuthInLocalStorage };
  34 | 
```