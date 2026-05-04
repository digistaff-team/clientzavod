# Default Moderator: Owner as Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить глобальную переменную `CONTENT_MVP_MODERATOR_USER_ID` как дефолтного получателя черновиков на `verifiedTelegramId` владельца контейнера.

**Architecture:** Добавить хелпер `getEffectiveModerator(chatId, channelConfig)` в `manage/store.js`. Все сервисы модерации вызывают этот хелпер вместо inline-цепочки с env-переменной. Access-check блоки в `server.js` и `runner.js` убирают env-переменную — владелец уже защищён через `ownerTgId`/`verifiedTelegramId` в `allowedIds`.

**Tech Stack:** Node.js, `manage/store.js`, Telegraf (CW Bot)

---

### Task 1: Добавить `getEffectiveModerator` в store.js

**Files:**
- Modify: `manage/store.js` (перед `module.exports`)
- Modify: `manage/store.js` (в `module.exports`)
- Test: `tests/channel.topics.test.js` (добавить тест в конец файла)

- [ ] **Шаг 1: Написать падающий тест**

Открыть `tests/channel.topics.test.js`, добавить в конец файла перед финальным запуском:

```js
async function testGetEffectiveModerator() {
  console.log('Test: getEffectiveModerator returns channel config moderator first');

  // Мок statesCache через временную подмену
  const store = require('../manage/store');

  // Патчим getState, чтобы не зависеть от файловой системы
  const origGetState = store.getState;
  store.getState = (chatId) => ({
    verifiedTelegramId: '111111',
    chatId
  });

  const result1 = store.getEffectiveModerator('999', { moderatorUserId: '777777' });
  assert.strictEqual(result1, '777777', 'должен вернуть moderatorUserId из channelConfig');

  const result2 = store.getEffectiveModerator('999', { moderator_user_id: '888888' });
  assert.strictEqual(result2, '888888', 'должен вернуть moderator_user_id из channelConfig');

  const result3 = store.getEffectiveModerator('999', {});
  assert.strictEqual(result3, '111111', 'без channelConfig — возвращает verifiedTelegramId');

  const result4 = store.getEffectiveModerator('999', null);
  assert.strictEqual(result4, '111111', 'null channelConfig — возвращает verifiedTelegramId');

  store.getState = (chatId) => ({ verifiedTelegramId: null, chatId });
  const result5 = store.getEffectiveModerator('999', null);
  assert.strictEqual(result5, '999', 'нет verifiedTelegramId — возвращает chatId');

  store.getState = origGetState;
  console.log('✅ getEffectiveModerator: all assertions passed');
}
```

И в блоке запуска тестов добавить вызов: `await testGetEffectiveModerator();`

- [ ] **Шаг 2: Запустить тест — убедиться что падает**

```bash
node tests/channel.topics.test.js 2>&1 | tail -5
```

Ожидаемо: `TypeError: store.getEffectiveModerator is not a function`

- [ ] **Шаг 3: Добавить функцию в `manage/store.js`**

Найти строку `module.exports = {` (~строка 1378). Добавить функцию непосредственно перед ней:

```js
function getEffectiveModerator(chatId, channelConfig) {
    const state = getState(chatId);
    return String(
        channelConfig?.moderatorUserId ||
        channelConfig?.moderator_user_id ||
        state?.verifiedTelegramId ||
        chatId
    );
}
```

- [ ] **Шаг 4: Добавить в `module.exports`**

В `module.exports = { ... }` после последней строки перед закрывающей скобкой добавить:

```js
    getEffectiveModerator,
```

- [ ] **Шаг 5: Запустить тест — убедиться что проходит**

```bash
node tests/channel.topics.test.js 2>&1 | tail -5
```

Ожидаемо: `✅ getEffectiveModerator: all assertions passed`

- [ ] **Шаг 6: Коммит**

```bash
git add manage/store.js tests/channel.topics.test.js
git commit -m "feat: getEffectiveModerator helper in store.js"
```

---

### Task 2: Обновить telegramMvp.service.js

**Files:**
- Modify: `services/telegramMvp.service.js:48` (удалить константу `MODERATOR_USER_ID`)
- Modify: `services/telegramMvp.service.js:93` (убрать `MODERATOR_USER_ID` из `getContentSettings`)
- Modify: `services/telegramMvp.service.js:1186` (`sendVideoDraftToModerator`)
- Modify: `services/telegramMvp.service.js:1286` (`sendDraftToModerator`)

- [ ] **Шаг 1: Удалить константу и обновить `getContentSettings`**

Строка 48 — заменить:
```js
const MODERATOR_USER_ID = process.env.CONTENT_MVP_MODERATOR_USER_ID || null;
```
на (просто удалить эту строку).

Строка 93 — заменить:
```js
    moderatorUserId: cfg?.moderatorUserId || MODERATOR_USER_ID,
```
на:
```js
    moderatorUserId: cfg?.moderatorUserId || null,
```

- [ ] **Шаг 2: Обновить `sendVideoDraftToModerator` (строка ~1186)**

Заменить:
```js
  const moderatorId = settings.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
  const moderatorId = manageStore.getEffectiveModerator(chatId, { moderatorUserId: settings.moderatorUserId });
```

- [ ] **Шаг 3: Обновить `sendDraftToModerator` (строка ~1286)**

Заменить:
```js
  const moderatorId = settings.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
  const moderatorId = manageStore.getEffectiveModerator(chatId, { moderatorUserId: settings.moderatorUserId });
```

- [ ] **Шаг 4: Коммит**

```bash
git add services/telegramMvp.service.js
git commit -m "fix: telegramMvp — default moderator from owner verifiedTelegramId"
```

---

### Task 3: Обновить vkMvp.service.js и okMvp.service.js

**Files:**
- Modify: `services/vkMvp.service.js:481-484`
- Modify: `services/okMvp.service.js:528-531`

- [ ] **Шаг 1: Обновить `vkMvp.service.js` (строки 481-484)**

Заменить:
```js
  const moderatorId = vkSettings?.moderatorUserId ||
                      globalSettings?.moderatorUserId ||
                      chatId;
```
на:
```js
  const moderatorId = manageStore.getEffectiveModerator(chatId, vkSettings);
```

Убедиться что `manageStore` уже импортирован в начале файла (он там есть как `require('../manage/store')`).

- [ ] **Шаг 2: Удалить теперь лишнюю переменную `globalSettings` в этой функции**

Строку:
```js
  const globalSettings = manageStore.getContentSettings?.(chatId);
```
можно удалить, если она используется только для `moderatorUserId`. Проверить: если `globalSettings` используется где-то ещё в той же функции — оставить. Если только для moderatorId — удалить.

- [ ] **Шаг 3: Обновить `okMvp.service.js` (строки 528-531)**

Заменить:
```js
  const moderatorId = okSettings?.moderatorUserId || 
                      globalSettings?.moderatorUserId || 
                      chatId;
```
на:
```js
  const moderatorId = manageStore.getEffectiveModerator(chatId, okSettings);
```

Аналогично проверить и при необходимости удалить `globalSettings` если она больше не нужна.

- [ ] **Шаг 4: Коммит**

```bash
git add services/vkMvp.service.js services/okMvp.service.js
git commit -m "fix: vkMvp + okMvp — default moderator from owner verifiedTelegramId"
```

---

### Task 4: Обновить instagramMvp.service.js

**Files:**
- Modify: `services/instagramMvp.service.js:502-504` (фото)
- Modify: `services/instagramMvp.service.js:864-866` (reels)

- [ ] **Шаг 1: Обновить функцию отправки фото-черновика (строки ~502-504)**

Заменить:
```js
  const moderatorId = igSettings?.moderator_user_id ||
                      globalSettings?.moderatorUserId ||
                      chatId;
```
на:
```js
  const moderatorId = manageStore.getEffectiveModerator(chatId, igSettings);
```

- [ ] **Шаг 2: Обновить функцию отправки Reels-черновика (строки ~864-866)**

Заменить:
```js
  const moderatorId = igSettings?.moderator_user_id ||
                      globalSettings?.moderatorUserId ||
                      chatId;
```
на:
```js
  const moderatorId = manageStore.getEffectiveModerator(chatId, igSettings);
```

В обоих случаях проверить и при необходимости удалить `globalSettings` если используется только для moderatorId.

- [ ] **Шаг 3: Коммит**

```bash
git add services/instagramMvp.service.js
git commit -m "fix: instagramMvp — default moderator from owner verifiedTelegramId"
```

---

### Task 5: Обновить youtubeMvp.service.js и pinterestMvp.service.js

**Files:**
- Modify: `services/youtubeMvp.service.js:502-504`
- Modify: `services/pinterestMvp.service.js:509-511`

- [ ] **Шаг 1: Обновить `youtubeMvp.service.js` (строки ~502-504)**

Заменить:
```js
  const moderatorId = settings.moderatorUserId ||
                      globalSettings?.moderatorUserId ||
                      chatId;
```
на:
```js
  const moderatorId = manageStore.getEffectiveModerator(chatId, settings);
```

Убедиться что `manageStore` импортирован. Удалить `globalSettings` если больше не нужна.

- [ ] **Шаг 2: Обновить `pinterestMvp.service.js` (строки ~509-511)**

Заменить:
```js
  const moderatorId = settings.moderatorUserId || 
                      globalSettings?.moderatorUserId || 
                      chatId;
```
на:
```js
  const moderatorId = manageStore.getEffectiveModerator(chatId, settings);
```

- [ ] **Шаг 3: Коммит**

```bash
git add services/youtubeMvp.service.js services/pinterestMvp.service.js
git commit -m "fix: youtubeMvp + pinterestMvp — default moderator from owner verifiedTelegramId"
```

---

### Task 6: Обновить facebookMvp.service.js, tiktokMvp.service.js, vkVideoMvp.service.js

**Files:**
- Modify: `services/facebookMvp.service.js:440`
- Modify: `services/tiktokMvp.service.js:351`
- Modify: `services/vkVideoMvp.service.js:457`

- [ ] **Шаг 1: Обновить `facebookMvp.service.js` (строка 440)**

Заменить:
```js
  const moderatorId = settings.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID || chatId;
```
на:
```js
  const moderatorId = manageStore.getEffectiveModerator(chatId, settings);
```

- [ ] **Шаг 2: Обновить `tiktokMvp.service.js` (строка 351)**

Заменить:
```js
  const moderatorId = settings.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
  const moderatorId = manageStore.getEffectiveModerator(chatId, settings);
```

Строку `if (!moderatorId) { ... }` — удалить: `getEffectiveModerator` всегда возвращает непустую строку.

- [ ] **Шаг 3: Обновить `vkVideoMvp.service.js` (строка 457)**

Заменить:
```js
  const moderatorId = settings.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
  const moderatorId = manageStore.getEffectiveModerator(chatId, settings);
```

Аналогично удалить `if (!moderatorId) { ... }` ниже.

- [ ] **Шаг 4: Коммит**

```bash
git add services/facebookMvp.service.js services/tiktokMvp.service.js services/vkVideoMvp.service.js
git commit -m "fix: facebook + tiktok + vkVideo — default moderator from owner verifiedTelegramId"
```

---

### Task 7: Обновить services/content/worker.js

**Files:**
- Modify: `services/content/worker.js:619-621` (блок алерта об ошибке)
- Modify: `services/content/worker.js:661` (функция `sendBlogModerationRequest`)

- [ ] **Шаг 1: Обновить блок алерта об ошибке (строки ~619-621)**

Заменить:
```js
      const moderatorId = wpConfig?.moderatorUserId
        || process.env.CONTENT_MVP_MODERATOR_USER_ID
        || stateData?.verifiedTelegramId;
```
на:
```js
      const moderatorId = manageStore.getEffectiveModerator(chatId, wpConfig);
```

Строку `const stateData = manageStore.getState(chatId);` — удалить если она использовалась только для `verifiedTelegramId`.

- [ ] **Шаг 2: Обновить `sendBlogModerationRequest` (строка ~661)**

Заменить:
```js
    const moderatorId = wpConfig?.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID || data?.verifiedTelegramId || null;
```
на:
```js
    const moderatorId = manageStore.getEffectiveModerator(chatId, wpConfig);
```

Убрать строку `const data = manageStore.getState(chatId);` если она теперь не используется в этой функции.

- [ ] **Шаг 3: Коммит**

```bash
git add services/content/worker.js
git commit -m "fix: worker.js (WP) — default moderator from owner verifiedTelegramId"
```

---

### Task 8: Обновить server.js — убрать env-переменную из 9 access-check блоков

**Files:**
- Modify: `server.js` строки 289, 343, 394, 442, 490, 539, 587, 634, 683

Во всех этих местах паттерн одинаковый — `channelModeratorId` используется только для добавления в `allowedIds`. Владелец (`ownerTgId` / `verifiedTelegramId`) уже всегда в `allowedIds`, поэтому env-переменная здесь была лишней.

- [ ] **Шаг 1: Строка 289 (TG content)**

Заменить:
```js
                const moderatorId = String(contentSettings.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID || '');
```
на:
```js
                const moderatorId = String(contentSettings.moderatorUserId || '');
```

- [ ] **Шаг 2: Строка 343 (VK search loop)**

Заменить:
```js
                const channelModeratorId = vkSettings.moderatorUserId ||
                                           globalSettings.moderatorUserId ||
                                           process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
                const channelModeratorId = vkSettings.moderatorUserId ||
                                           globalSettings.moderatorUserId ||
                                           data.verifiedTelegramId;
```

- [ ] **Шаг 3: Строка 394 (OK search loop)**

Заменить:
```js
                const channelModeratorId = okSettings.moderatorUserId ||
                                           globalSettings.moderatorUserId ||
                                           process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
                const channelModeratorId = okSettings.moderatorUserId ||
                                           globalSettings.moderatorUserId ||
                                           data.verifiedTelegramId;
```

- [ ] **Шаг 4: Строка 442 (IG search loop)**

Заменить:
```js
                const channelModeratorId = String(igConfig.moderator_user_id ||
                                           globalSettings.moderatorUserId ||
                                           process.env.CONTENT_MVP_MODERATOR_USER_ID || '');
```
на:
```js
                const channelModeratorId = String(igConfig.moderator_user_id ||
                                           globalSettings.moderatorUserId ||
                                           data.verifiedTelegramId || '');
```

- [ ] **Шаг 5: Строка 490 (YT search loop)**

Заменить:
```js
                const channelModeratorId = ytSettings.moderator_user_id ||
                                           globalSettings.moderatorUserId ||
                                           process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
                const channelModeratorId = ytSettings.moderator_user_id ||
                                           globalSettings.moderatorUserId ||
                                           data.verifiedTelegramId;
```

- [ ] **Шаг 6: Строка 539 (Pinterest search loop)**

Заменить:
```js
                const channelModeratorId = pinSettings.moderatorUserId ||
                                           globalSettings.moderatorUserId ||
                                           process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
                const channelModeratorId = pinSettings.moderatorUserId ||
                                           globalSettings.moderatorUserId ||
                                           data.verifiedTelegramId;
```

- [ ] **Шаг 7: Строка 587 (TikTok search loop)**

Заменить:
```js
                const channelModeratorId = ttSettings.moderatorUserId ||
                                           globalSettings.moderatorUserId ||
                                           process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
                const channelModeratorId = ttSettings.moderatorUserId ||
                                           globalSettings.moderatorUserId ||
                                           data.verifiedTelegramId;
```

- [ ] **Шаг 8: Строка 634 (Facebook search loop)**

Заменить:
```js
                const channelModeratorId = fbConfig.moderatorUserId ||
                                           globalSettings.moderatorUserId ||
                                           process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
                const channelModeratorId = fbConfig.moderatorUserId ||
                                           globalSettings.moderatorUserId ||
                                           data.verifiedTelegramId;
```

- [ ] **Шаг 9: Строка 683 (VK Video search loop)**

Заменить:
```js
                const channelModeratorId = vkVidSettings.moderator_user_id ||
                                           globalSettings.moderatorUserId ||
                                           process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
                const channelModeratorId = vkVidSettings.moderator_user_id ||
                                           globalSettings.moderatorUserId ||
                                           data.verifiedTelegramId;
```

- [ ] **Шаг 10: Проверить отсутствие оставшихся вхождений**

```bash
grep -n "CONTENT_MVP_MODERATOR_USER_ID" server.js
```

Ожидаемо: нет вывода.

- [ ] **Шаг 11: Коммит**

```bash
git add server.js
git commit -m "fix: server.js access checks — remove CONTENT_MVP_MODERATOR_USER_ID"
```

---

### Task 9: Обновить manage/telegram/runner.js — убрать env-переменную из 11 мест

**Files:**
- Modify: `manage/telegram/runner.js` строки 899, 919, 971, 991, 1038, 1058, 1101, 1119, 1160, 1177, 1234

- [ ] **Шаг 1: Строка 899 (TG content — поиск chatId)**

Заменить:
```js
            const moderatorId = String(contentSettings.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID || '');
```
на:
```js
            const moderatorId = String(contentSettings.moderatorUserId || data.verifiedTelegramId || '');
```

- [ ] **Шаг 2: Строка 919 (TG content — финальная проверка доступа)**

Заменить:
```js
        const moderatorId = String(settings.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID || '');
```
на:
```js
        const moderatorId = String(settings.moderatorUserId || '');
```

- [ ] **Шаг 3: Строка 971 (Pinterest search loop)**

Заменить:
```js
            const channelModeratorId = pinSettings.moderator_user_id || 
                                       globalSettings.moderatorUserId || 
                                       process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
            const channelModeratorId = pinSettings.moderator_user_id || 
                                       globalSettings.moderatorUserId || 
                                       data.verifiedTelegramId;
```

- [ ] **Шаг 4: Строка 991 (Pinterest финальная проверка)**

Заменить:
```js
        const moderatorId = String(settings.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID || '');
```
на:
```js
        const moderatorId = String(settings.moderatorUserId || '');
```

- [ ] **Шаг 5: Строка 1038 (VK search loop)**

Заменить:
```js
            const channelModeratorId = vkSettings.moderatorUserId ||
                                       globalSettings.moderatorUserId ||
                                       process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
            const channelModeratorId = vkSettings.moderatorUserId ||
                                       globalSettings.moderatorUserId ||
                                       data.verifiedTelegramId;
```

- [ ] **Шаг 6: Строка 1058 (VK финальная проверка)**

Заменить:
```js
        const moderatorId = String(settings.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID || '');
```
на:
```js
        const moderatorId = String(settings.moderatorUserId || '');
```

- [ ] **Шаг 7: Строка 1101 (OK search loop)**

Заменить:
```js
            const channelModeratorId = okSettings.moderatorUserId || 
                                       globalSettings.moderatorUserId || 
                                       process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
            const channelModeratorId = okSettings.moderatorUserId || 
                                       globalSettings.moderatorUserId || 
                                       data.verifiedTelegramId;
```

- [ ] **Шаг 8: Строка 1119 (OK финальная проверка)**

Заменить:
```js
        const moderatorId = String(okSettings.moderatorUserId || settings.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID || '');
```
на:
```js
        const moderatorId = String(okSettings.moderatorUserId || settings.moderatorUserId || '');
```

- [ ] **Шаг 9: Строка 1160 (Instagram search loop)**

Заменить:
```js
            const channelModeratorId = igSettings.moderator_user_id || 
                                       globalSettings.moderatorUserId || 
                                       process.env.CONTENT_MVP_MODERATOR_USER_ID;
```
на:
```js
            const channelModeratorId = igSettings.moderator_user_id || 
                                       globalSettings.moderatorUserId || 
                                       data.verifiedTelegramId;
```

- [ ] **Шаг 10: Строка 1177 (Instagram финальная проверка)**

Заменить:
```js
        const moderatorId = String(settings.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID || '');
```
на:
```js
        const moderatorId = String(settings.moderatorUserId || '');
```

- [ ] **Шаг 11: Строка 1234 (WP access check)**

Заменить:
```js
        const moderatorId = wpConfig?.moderatorUserId || process.env.CONTENT_MVP_MODERATOR_USER_ID || '';
```
на:
```js
        const moderatorId = wpConfig?.moderatorUserId || '';
```

- [ ] **Шаг 12: Проверить отсутствие оставшихся вхождений**

```bash
grep -n "CONTENT_MVP_MODERATOR_USER_ID" manage/telegram/runner.js
```

Ожидаемо: нет вывода.

- [ ] **Шаг 13: Коммит**

```bash
git add manage/telegram/runner.js
git commit -m "fix: runner.js access checks — remove CONTENT_MVP_MODERATOR_USER_ID"
```

---

### Task 10: Удалить переменную из .env и финальная проверка

**Files:**
- Modify: `.env`

- [ ] **Шаг 1: Удалить строку из `.env`**

Найти и удалить строку:
```
CONTENT_MVP_MODERATOR_USER_ID=8092697980
```

- [ ] **Шаг 2: Финальная проверка — ни одного вхождения во всём проекте**

```bash
grep -rn "CONTENT_MVP_MODERATOR_USER_ID" --include="*.js" --include="*.env*" --exclude-dir=node_modules .
```

Ожидаемо: нет вывода.

- [ ] **Шаг 3: Запустить все unit-тесты**

```bash
npm test 2>&1 | tail -20
```

Ожидаемо: все тесты проходят.

- [ ] **Шаг 4: Перезапустить приложение и проверить старт**

```bash
docker-compose restart app && docker-compose logs -f app 2>&1 | head -30
```

Ожидаемо: нет ошибок при старте, нет упоминаний `CONTENT_MVP_MODERATOR_USER_ID`.

- [ ] **Шаг 5: Коммит**

```bash
git add .env
git commit -m "chore: remove CONTENT_MVP_MODERATOR_USER_ID from .env"
```
