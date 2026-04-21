# Premoderation Moderator Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать глобальное поле `moderator_user_id` из `integrationSettings` и сделать chatId пользователя дефолтным модератором для каждого канала — поле ID модератора заполняется автоматически при включении премодерации.

**Architecture:** Три слоя изменений: (1) бэкенд — `store.js` перестаёт сохранять глобальный `moderator_user_id`; (2) HTML — удаляется скрытый `input#globalModeratorUserId`; (3) JS — все `toggleXxxModeratorField()` авто-заполняют поле через `getChatId()`, функции загрузки используют `|| chatId` как дефолт.

**Tech Stack:** Vanilla JS, HTML, Node.js (manage/store.js)

---

### Task 1: Бэкенд — убрать сохранение глобального moderator_user_id

**Files:**
- Modify: `manage/store.js:574-582`

- [ ] **Step 1: Удалить строку сохранения в setIntegrationSettings**

Открыть `manage/store.js`, найти функцию `setIntegrationSettings` (строка ~574). Убрать строку обработки `moderator_user_id`:

```js
// Было (строка 579):
if (patch.moderator_user_id !== undefined) next.moderator_user_id = String(patch.moderator_user_id || '').trim() || null;

// Стало — строку удалить полностью
```

Итоговая функция должна выглядеть так:

```js
function setIntegrationSettings(chatId, patch = {}) {
    if (!statesCache[chatId]) statesCache[chatId] = {};
    const current = statesCache[chatId].integrationSettings || {};
    const next = { ...current };
    if (patch.buffer_api_key !== undefined) next.buffer_api_key = patch.buffer_api_key || null;
    statesCache[chatId].integrationSettings = next;
    return persist(chatId);
}
```

- [ ] **Step 2: Перезапустить контейнер и убедиться что сервер стартует**

```bash
docker-compose restart app && sleep 3 && docker-compose logs --tail=20 app
```

Ожидаемый результат: сервер запустился без ошибок, нет `SyntaxError` или `TypeError`.

- [ ] **Step 3: Commit**

```bash
git add manage/store.js
git commit -m "fix: игнорировать moderator_user_id в setIntegrationSettings"
```

---

### Task 2: HTML — удалить скрытый input globalModeratorUserId

**Files:**
- Modify: `public/channels.html:41-46`

- [ ] **Step 1: Удалить строку с globalModeratorUserId**

В файле `public/channels.html` найти (строка ~44):

```html
<input type="hidden" id="globalModeratorUserId" />
```

Удалить только эту строку. Блок `integrationsBlock` должен остаться (в нём ещё `globalBufferApiKey`):

```html
<!-- Глобальные настройки интеграций (скрыто, только для JS-совместимости) -->
<div id="integrationsBlock" style="display: none;">
    <input type="hidden" id="globalBufferApiKey" />
    <div id="integrationsStatus"></div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add public/channels.html
git commit -m "fix: удалить globalModeratorUserId из channels.html"
```

---

### Task 3: channels.js — удалить загрузку и сохранение глобального поля

**Files:**
- Modify: `public/js/channels.js:743-766`

- [ ] **Step 1: Убрать чтение globalModeratorUserId при загрузке (loadIntegrationSettings)**

Найти в `public/js/channels.js` (строки ~742-754):

```js
const data = await res.json();
const s = data.settings || {};
const keyEl = document.getElementById('globalBufferApiKey');
const modEl = document.getElementById('globalModeratorUserId');
if (s.buffer_api_key) {
    if (keyEl) keyEl.value = s.buffer_api_key;
    // Populate all per-channel Buffer API Token fields
```

Убрать строку `const modEl = document.getElementById('globalModeratorUserId');` и строку `if (modEl && s.moderator_user_id) modEl.value = s.moderator_user_id;`.

Результат:

```js
const data = await res.json();
const s = data.settings || {};
const keyEl = document.getElementById('globalBufferApiKey');
if (s.buffer_api_key) {
    if (keyEl) keyEl.value = s.buffer_api_key;
    // Populate all per-channel Buffer API Token fields
```

- [ ] **Step 2: Убрать сохранение globalModeratorUserId (saveIntegrationSettings)**

Найти (строки ~758-766):

```js
const chatId = getChatId();
if (!chatId) return;
const apiKey = (document.getElementById('globalBufferApiKey')?.value || '').trim();
const modId = (document.getElementById('globalModeratorUserId')?.value || '').trim();
const statusEl = document.getElementById('integrationsStatus');
const body = { chat_id: chatId };
if (apiKey && !apiKey.endsWith('***')) body.buffer_api_key = apiKey;
if (modId) body.moderator_user_id = modId;
```

Заменить на (убрать две строки с `modId`):

```js
const chatId = getChatId();
if (!chatId) return;
const apiKey = (document.getElementById('globalBufferApiKey')?.value || '').trim();
const statusEl = document.getElementById('integrationsStatus');
const body = { chat_id: chatId };
if (apiKey && !apiKey.endsWith('***')) body.buffer_api_key = apiKey;
```

- [ ] **Step 3: Commit**

```bash
git add public/js/channels.js
git commit -m "fix: удалить загрузку/сохранение globalModeratorUserId из channels.js"
```

---

### Task 4: channels.js — авто-заполнение chatId при включении премодерации

**Files:**
- Modify: `public/js/channels.js` — функции `toggleXxxModeratorField` и функции загрузки

Во всех каналах нужны два изменения:
1. **Функции загрузки** — заменить `|| ''` на `|| chatId` при чтении `moderator_user_id`.
2. **Функции toggle** — добавить авто-заполнение `getChatId()` если поле пустое при включении.

> **Примечание:** Telegram (contentSettings) и VK, OK уже используют `|| chatId` при загрузке — не трогать.

- [ ] **Step 1: Pinterest — загрузка**

Найти (строка ~927):
```js
if (pinterestModeratorEl) pinterestModeratorEl.value = cfg.moderator_user_id || '';
```
Заменить:
```js
if (pinterestModeratorEl) pinterestModeratorEl.value = cfg.moderator_user_id || chatId;
```

- [ ] **Step 2: Pinterest — togglePinterestModeratorField**

Найти (строки ~1104-1110):
```js
function togglePinterestModeratorField() {
    const premoderation = document.getElementById('pinterestPremoderation')?.checked || false;
    const moderatorField = document.getElementById('pinterestModeratorField');
    if (moderatorField) {
        moderatorField.classList.toggle('visible', premoderation);
    }
}
```
Заменить:
```js
function togglePinterestModeratorField() {
    const premoderation = document.getElementById('pinterestPremoderation')?.checked || false;
    const moderatorField = document.getElementById('pinterestModeratorField');
    if (moderatorField) {
        moderatorField.classList.toggle('visible', premoderation);
    }
    if (premoderation) {
        const input = document.getElementById('pinterestModeratorUserId');
        if (input && !input.value.trim()) input.value = getChatId() || '';
    }
}
```

- [ ] **Step 3: Instagram — загрузка**

Найти (строка ~1366):
```js
if (instagramModeratorEl) instagramModeratorEl.value = cfg.moderator_user_id || '';
```
Заменить:
```js
if (instagramModeratorEl) instagramModeratorEl.value = cfg.moderator_user_id || chatId;
```

- [ ] **Step 4: Instagram — toggleInstagramModeratorField**

Найти (строки ~1445-1451):
```js
function toggleInstagramModeratorField() {
    const premoderation = document.getElementById('instagramPremoderation')?.checked || false;
    const moderatorField = document.getElementById('instagramModeratorField');
    if (moderatorField) {
        moderatorField.classList.toggle('visible', premoderation);
    }
}
```
Заменить:
```js
function toggleInstagramModeratorField() {
    const premoderation = document.getElementById('instagramPremoderation')?.checked || false;
    const moderatorField = document.getElementById('instagramModeratorField');
    if (moderatorField) {
        moderatorField.classList.toggle('visible', premoderation);
    }
    if (premoderation) {
        const input = document.getElementById('instagramModeratorUserId');
        if (input && !input.value.trim()) input.value = getChatId() || '';
    }
}
```

- [ ] **Step 5: VK — toggleVkModeratorField**

VK уже загружает `|| chatId` — только добавляем авто-заполнение в toggle.

Найти (строки ~2322-2328):
```js
function toggleVkModeratorField() {
    const premoderation = document.getElementById('vkPremoderation')?.checked || false;
    const moderatorField = document.getElementById('vkModeratorField');
    if (moderatorField) {
        moderatorField.classList.toggle('visible', premoderation);
    }
}
```
Заменить:
```js
function toggleVkModeratorField() {
    const premoderation = document.getElementById('vkPremoderation')?.checked || false;
    const moderatorField = document.getElementById('vkModeratorField');
    if (moderatorField) {
        moderatorField.classList.toggle('visible', premoderation);
    }
    if (premoderation) {
        const input = document.getElementById('vkModeratorUserId');
        if (input && !input.value.trim()) input.value = getChatId() || '';
    }
}
```

- [ ] **Step 6: OK — toggleOkModeratorField**

OK уже загружает `|| chatId` — только добавляем авто-заполнение в toggle.

Найти (строки ~2330-2336):
```js
function toggleOkModeratorField() {
    const premoderation = document.getElementById('okPremoderation')?.checked || false;
    const moderatorField = document.getElementById('okModeratorField');
    if (moderatorField) {
        moderatorField.classList.toggle('visible', premoderation);
    }
}
```
Заменить:
```js
function toggleOkModeratorField() {
    const premoderation = document.getElementById('okPremoderation')?.checked || false;
    const moderatorField = document.getElementById('okModeratorField');
    if (moderatorField) {
        moderatorField.classList.toggle('visible', premoderation);
    }
    if (premoderation) {
        const input = document.getElementById('okModeratorUserId');
        if (input && !input.value.trim()) input.value = getChatId() || '';
    }
}
```

- [ ] **Step 7: Telegram — toggleTelegramModeratorField**

Telegram загружает `|| chatId` — добавляем авто-заполнение в toggle.

Найти (строки ~2314-2320):
```js
function toggleTelegramModeratorField() {
    const premoderation = document.getElementById('contentPremoderation')?.checked || false;
    const moderatorField = document.getElementById('telegramModeratorField');
    if (moderatorField) {
        moderatorField.classList.toggle('visible', premoderation);
    }
}
```
Заменить:
```js
function toggleTelegramModeratorField() {
    const premoderation = document.getElementById('contentPremoderation')?.checked || false;
    const moderatorField = document.getElementById('telegramModeratorField');
    if (moderatorField) {
        moderatorField.classList.toggle('visible', premoderation);
    }
    if (premoderation) {
        const input = document.getElementById('contentModeratorUserId');
        if (input && !input.value.trim()) input.value = getChatId() || '';
    }
}
```

- [ ] **Step 8: YouTube — загрузка**

Найти (строка ~2120):
```js
if (youtubeModeratorEl) youtubeModeratorEl.value = cfg.moderator_user_id || '';
```
Заменить:
```js
if (youtubeModeratorEl) youtubeModeratorEl.value = cfg.moderator_user_id || chatId;
```

- [ ] **Step 9: YouTube — toggleYoutubeModeratorField**

Найти (строки ~2338-2344):
```js
function toggleYoutubeModeratorField() {
    const premoderation = document.getElementById('youtubePremoderation')?.checked || false;
    const moderatorField = document.getElementById('youtubeModeratorField');
    if (moderatorField) {
        moderatorField.classList.toggle('visible', premoderation);
    }
}
```
Заменить:
```js
function toggleYoutubeModeratorField() {
    const premoderation = document.getElementById('youtubePremoderation')?.checked || false;
    const moderatorField = document.getElementById('youtubeModeratorField');
    if (moderatorField) {
        moderatorField.classList.toggle('visible', premoderation);
    }
    if (premoderation) {
        const input = document.getElementById('youtubeModeratorUserId');
        if (input && !input.value.trim()) input.value = getChatId() || '';
    }
}
```

- [ ] **Step 10: VK Video — загрузка**

Найти (строка ~2587):
```js
if (vkVideoModeratorEl) vkVideoModeratorEl.value = cfg.moderator_user_id || '';
```
Заменить:
```js
if (vkVideoModeratorEl) vkVideoModeratorEl.value = cfg.moderator_user_id || chatId;
```

- [ ] **Step 11: VK Video — toggleVkVideoModeratorField**

Найти (строки ~2539-2543):
```js
function toggleVkVideoModeratorField() {
    const checkbox = document.getElementById('vkVideoPremoderation');
    const field = document.getElementById('vkVideoModeratorField');
    if (field) field.style.display = (checkbox && checkbox.checked) ? 'flex' : 'none';
}
```
Заменить (унифицировать с `.visible` и добавить авто-заполнение):
```js
function toggleVkVideoModeratorField() {
    const premoderation = document.getElementById('vkVideoPremoderation')?.checked || false;
    const field = document.getElementById('vkVideoModeratorField');
    if (field) field.classList.toggle('visible', premoderation);
    if (premoderation) {
        const input = document.getElementById('vkVideoModeratorUserId');
        if (input && !input.value.trim()) input.value = getChatId() || '';
    }
}
```

- [ ] **Step 12: TikTok — загрузка**

Найти (строка ~2934):
```js
if (tiktokModeratorEl) tiktokModeratorEl.value = cfg.moderator_user_id || '';
```
Заменить:
```js
if (tiktokModeratorEl) tiktokModeratorEl.value = cfg.moderator_user_id || chatId;
```

- [ ] **Step 13: TikTok — toggleTiktokModeratorField**

Найти (строки ~2777-2781):
```js
function toggleTiktokModeratorField() {
    const premod = document.getElementById('tiktokPremoderation');
    const field = document.getElementById('tiktokModeratorField');
    if (field) field.style.display = premod?.checked ? 'block' : 'none';
}
```
Заменить:
```js
function toggleTiktokModeratorField() {
    const premoderation = document.getElementById('tiktokPremoderation')?.checked || false;
    const field = document.getElementById('tiktokModeratorField');
    if (field) field.classList.toggle('visible', premoderation);
    if (premoderation) {
        const input = document.getElementById('tiktokModeratorUserId');
        if (input && !input.value.trim()) input.value = getChatId() || '';
    }
}
```

- [ ] **Step 14: Instagram Reels — загрузка**

Найти (строка ~3128):
```js
if (modEl) modEl.value = cfg.moderator_user_id || '';
```
Заменить:
```js
if (modEl) modEl.value = cfg.moderator_user_id || chatId;
```

- [ ] **Step 15: Instagram Reels — toggleInstagramReelsModeratorField**

Найти (строки ~3055-3059):
```js
function toggleInstagramReelsModeratorField() {
    const premod = document.getElementById('instagramReelsPremoderation');
    const field = document.getElementById('instagramReelsModeratorField');
    if (field) field.style.display = premod?.checked ? 'block' : 'none';
}
```
Заменить:
```js
function toggleInstagramReelsModeratorField() {
    const premoderation = document.getElementById('instagramReelsPremoderation')?.checked || false;
    const field = document.getElementById('instagramReelsModeratorField');
    if (field) field.classList.toggle('visible', premoderation);
    if (premoderation) {
        const input = document.getElementById('instagramReelsModeratorUserId');
        if (input && !input.value.trim()) input.value = getChatId() || '';
    }
}
```

- [ ] **Step 16: Commit**

```bash
git add public/js/channels.js
git commit -m "feat: авто-заполнение chatId в поле модератора при включении премодерации"
```

---

### Task 5: channels-facebook.js — загрузка и toggle

**Files:**
- Modify: `public/js/channels-facebook.js:156-161, 243-250`

- [ ] **Step 1: Facebook — загрузка**

Найти (строка ~160):
```js
if (facebookModeratorEl) facebookModeratorEl.value = cfg.moderator_user_id || '';
```
Заменить. `chatId` здесь нужно получить через `getChatId()`, так как переменная `chatId` объявлена выше в той же функции:
```js
if (facebookModeratorEl) facebookModeratorEl.value = cfg.moderator_user_id || getChatId() || '';
```

- [ ] **Step 2: Facebook — toggleFacebookModeratorField**

Найти (строки ~243-249):
```js
function toggleFacebookModeratorField() {
    const premoderation = document.getElementById('facebookPremoderation')?.checked || false;
    const moderatorField = document.getElementById('facebookModeratorField');
    if (moderatorField) {
```
Добавить авто-заполнение после закрывающей `}` блока `if (moderatorField)`:
```js
function toggleFacebookModeratorField() {
    const premoderation = document.getElementById('facebookPremoderation')?.checked || false;
    const moderatorField = document.getElementById('facebookModeratorField');
    if (moderatorField) {
        moderatorField.classList.toggle('visible', premoderation);
    }
    if (premoderation) {
        const input = document.getElementById('facebookModeratorUserId');
        if (input && !input.value.trim()) input.value = getChatId() || '';
    }
}
```

- [ ] **Step 3: Перезапустить контейнер**

```bash
docker-compose restart app
```

- [ ] **Step 4: Commit**

```bash
git add public/js/channels-facebook.js
git commit -m "feat: авто-заполнение chatId в поле модератора Facebook"
```

---

### Task 6: Финальная проверка

- [ ] **Step 1: Открыть /channels.html в браузере и проверить каждый канал**

Для каждого канала, у которого включена премодерация:
1. Поле "ID Модератора" видно и содержит chatId пользователя.
2. Снять чекбокс → поле скрывается.
3. Поставить чекбокс → поле появляется с chatId пользователя.
4. Ввести другой ID вручную → сохранить → перезагрузить → видим сохранённый ID, не chatId.

- [ ] **Step 2: Убедиться что Buffer API Key по-прежнему сохраняется**

Изменить Buffer API Key → сохранить → перезагрузить → ключ сохранён.

- [ ] **Step 3: Проверить логи на ошибки**

```bash
docker-compose logs --tail=30 app | grep -i error
```

Ожидаемый результат: нет новых ошибок.
