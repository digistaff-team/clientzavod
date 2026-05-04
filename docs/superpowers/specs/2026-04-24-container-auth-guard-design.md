# Container Auth Guard — Design Spec
**Date:** 2026-04-24

## Problem

Any HTTP client knowing the server URL can create a Docker container with an arbitrary `chat_id` by calling `POST /api/session/create` with no authentication. The same applies to `POST /api/apps/:chat_id/fix/:app_name`, `POST /api/apps/:chat_id/:action`, and all endpoints under `/api/manage/*`. There is no middleware enforcing that the `chat_id` in a request belongs to a real Telegram-verified user.

## Solution

Add a single middleware `requireVerifiedChatId` applied at four mount points. The guard checks `manageStore.getState(chatId).verifiedTelegramId` — a field set exclusively by `routes/auth.routes.js` after the Telegram bot confirms the user's identity.

## Architecture

```
requireVerifiedChatId(getChatId)
  1. getChatId(req) → chatId
  2. manageStore.getState(chatId) → state
  3. state.verifiedTelegramId truthy? → next()
                               falsy?  → 403
```

The check uses the in-memory `statesCache` (already populated at server start via `recoverAllSessions`). No disk reads on hot path.

## New File

**`middleware/requireVerifiedChatId.js`**

```javascript
const manageStore = require('../manage/store');

module.exports = function requireVerifiedChatId(getChatId) {
    return (req, res, next) => {
        const chatId = String(getChatId(req) || '');
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }
        const state = manageStore.getState(chatId);
        if (!state || !state.verifiedTelegramId) {
            return res.status(403).json({ error: 'Access denied. Authorize via Telegram bot @clientzavod_bot first.' });
        }
        next();
    };
};
```

## Changed Files

| File | Change |
|---|---|
| `routes/session.routes.js` | Add middleware to `POST /create` |
| `routes/apps.routes.js` | Add middleware to `POST /:chat_id/fix/:app_name` and `POST /:chat_id/:action` |
| `routes/index.js` | Add middleware to `router.use('/manage', ...)` |

### routes/session.routes.js

```javascript
// строка 122 — ДО
router.post('/create', async (req, res) => {
// ПОСЛЕ
router.post('/create', requireVerifiedChatId(req => req.body?.chat_id), async (req, res) => {
```

### routes/apps.routes.js

```javascript
// строка 141
router.post('/:chat_id/fix/:app_name',
    requireVerifiedChatId(req => req.params.chat_id), async (req, res) => {

// строка 224
router.post('/:chat_id/:action',
    requireVerifiedChatId(req => req.params.chat_id), async (req, res) => {
```

### routes/index.js

```javascript
// строка 19 — ДО
router.use('/manage', manageRoutes);
// ПОСЛЕ
router.use('/manage', requireVerifiedChatId(
    req => req.body?.chatId || req.query?.chatId
), manageRoutes);
```

## What Is NOT Changed

- `routes/auth.routes.js` — sole setter of `verifiedTelegramId`, must stay open
- Internal Node.js service calls (`telegramMvp`, `vkMvp`, etc.) — they call `getOrCreateSession` directly, not via HTTP
- Webhook route `/` — processes incoming Telegram messages
- `routes/admin.routes.js` — already protected by `requireAdminAuth`

## Edge Cases

- **Cache cold at startup:** `getState` returns `undefined` → 403 → user must authenticate through the bot. Correct behaviour.
- **chatId type mismatch:** explicit `String()` cast in middleware aligns with existing `String()` usage throughout the codebase.
- **New user first login:** `auth.routes.js` sets `verifiedTelegramId` *before* calling `getOrCreateSession`, so the Telegram-bot auth flow is never blocked by this guard.

## Security Boundary After This Change

The only way to provision a new Docker container is:
1. User sends `/start` to `@clientzavod_bot`
2. Bot POSTs to `/api/auth/telegram-login` with a real Telegram-issued `telegram_id`
3. `auth.routes.js` sets `state.verifiedTelegramId = telegramId` and persists state
4. `getOrCreateSession` runs — container is created

Any request skipping steps 1–3 will receive 403 on all container-creation and manage endpoints.
