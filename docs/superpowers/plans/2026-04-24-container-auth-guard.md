# Container Auth Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Запретить создание Docker-контейнеров и доступ к `/api/manage/*` без верификации через Telegram-бот `@clientzavod_bot`.

**Architecture:** Один middleware `requireVerifiedChatId` проверяет `manageStore.getState(chatId).verifiedTelegramId` — флаг, который выставляет только `routes/auth.routes.js` после подтверждения от Telegram. Middleware применяется в 4 точках: `POST /api/session/create`, `POST /api/apps/:chat_id/fix/:app_name`, `POST /api/apps/:chat_id/:action`, и `router.use('/manage', ...)`. Существующий Telegram auth flow не затрагивается — он уже ставит `verifiedTelegramId` до вызова `getOrCreateSession`.

**Tech Stack:** Node.js, Express.js, `manage/store.js` (in-memory statesCache), `assert` (тесты без раннера)

---

## File Map

| Действие | Файл | Ответственность |
|---|---|---|
| Создать | `middleware/requireVerifiedChatId.js` | Middleware-фабрика: проверка verifiedTelegramId |
| Создать | `tests/requireVerifiedChatId.test.js` | Unit-тесты middleware |
| Изменить | `routes/session.routes.js:122` | Защита POST /create |
| Изменить | `routes/apps.routes.js:141` | Защита POST /:chat_id/fix/:app_name |
| Изменить | `routes/apps.routes.js:224` | Защита POST /:chat_id/:action |
| Изменить | `routes/index.js:19` | Защита /manage/* |

---

## Task 1: Создать middleware и его тесты

**Files:**
- Create: `middleware/requireVerifiedChatId.js`
- Create: `tests/requireVerifiedChatId.test.js`

- [ ] **Шаг 1.1: Написать failing тест**

Создать `tests/requireVerifiedChatId.test.js`:

```javascript
const assert = require('assert');

// Мок manage/store
let mockState = null;
require.cache[require.resolve('../manage/store')] = {
    id: require.resolve('../manage/store'),
    filename: require.resolve('../manage/store'),
    loaded: true,
    exports: {
        getState: (chatId) => mockState
    }
};

const requireVerifiedChatId = require('../middleware/requireVerifiedChatId');

function makeReqRes(chatIdSource) {
    const req = { body: {}, params: {}, query: {}, ...chatIdSource };
    const res = {
        _status: null, _json: null,
        status(code) { this._status = code; return this; },
        json(data) { this._json = data; return this; }
    };
    return { req, res };
}

let passed = 0;

// Test 1: нет chatId → 400
{
    const mw = requireVerifiedChatId(req => req.body.chat_id);
    const { req, res } = makeReqRes({ body: {} });
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(res._status, 400, 'должен вернуть 400 если chatId не передан');
    assert.strictEqual(nextCalled, false);
    passed++;
}

// Test 2: state не существует → 403
{
    mockState = null;
    const mw = requireVerifiedChatId(req => req.body.chat_id);
    const { req, res } = makeReqRes({ body: { chat_id: '12345' } });
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(res._status, 403, 'должен вернуть 403 если state не найден');
    assert.strictEqual(nextCalled, false);
    passed++;
}

// Test 3: state без verifiedTelegramId → 403
{
    mockState = { onboardingComplete: false };
    const mw = requireVerifiedChatId(req => req.body.chat_id);
    const { req, res } = makeReqRes({ body: { chat_id: '12345' } });
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(res._status, 403, 'должен вернуть 403 если verifiedTelegramId не задан');
    assert.strictEqual(nextCalled, false);
    passed++;
}

// Test 4: state с verifiedTelegramId → next()
{
    mockState = { verifiedTelegramId: 12345 };
    const mw = requireVerifiedChatId(req => req.body.chat_id);
    const { req, res } = makeReqRes({ body: { chat_id: '12345' } });
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'должен вызвать next() если verifiedTelegramId задан');
    passed++;
}

// Test 5: getChatId из req.params
{
    mockState = { verifiedTelegramId: 99999 };
    const mw = requireVerifiedChatId(req => req.params.chat_id);
    const { req, res } = makeReqRes({ params: { chat_id: '99999' } });
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'должен работать с chatId из params');
    passed++;
}

// Test 6: getChatId из req.query
{
    mockState = { verifiedTelegramId: 77777 };
    const mw = requireVerifiedChatId(req => req.query.chatId || req.body.chatId);
    const { req, res } = makeReqRes({ query: { chatId: '77777' } });
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'должен работать с chatId из query');
    passed++;
}

console.log(`requireVerifiedChatId: ${passed}/6 тестов прошли`);
```

- [ ] **Шаг 1.2: Запустить тест — убедиться что он падает**

```bash
cd /root/docker-claw && node tests/requireVerifiedChatId.test.js
```

Ожидаемый вывод: `Error: Cannot find module '../middleware/requireVerifiedChatId'`

- [ ] **Шаг 1.3: Создать middleware**

Создать `middleware/requireVerifiedChatId.js`:

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

- [ ] **Шаг 1.4: Запустить тест — убедиться что он проходит**

```bash
cd /root/docker-claw && node tests/requireVerifiedChatId.test.js
```

Ожидаемый вывод: `requireVerifiedChatId: 6/6 тестов прошли`

- [ ] **Шаг 1.5: Запустить все тесты — убедиться что ничего не сломалось**

```bash
cd /root/docker-claw && npm test
```

Ожидаемый вывод: все тесты проходят (без новых failures).

- [ ] **Шаг 1.6: Закоммитить**

```bash
cd /root/docker-claw && git add middleware/requireVerifiedChatId.js tests/requireVerifiedChatId.test.js
git commit -m "feat: добавить middleware requireVerifiedChatId для Telegram-верификации"
```

---

## Task 2: Защитить POST /api/session/create

**Files:**
- Modify: `routes/session.routes.js:1,122`

- [ ] **Шаг 2.1: Добавить require и middleware к роуту**

В `routes/session.routes.js` добавить импорт после строки 1 (`const express = require('express');`):

```javascript
const requireVerifiedChatId = require('../middleware/requireVerifiedChatId');
```

Заменить строку 122:

```javascript
// БЫЛО:
router.post('/create', async (req, res) => {

// СТАЛО:
router.post('/create', requireVerifiedChatId(req => req.body?.chat_id), async (req, res) => {
```

- [ ] **Шаг 2.2: Перезапустить контейнер чтобы подхватить изменения**

```bash
docker restart bash-executor && sleep 5
```

- [ ] **Шаг 2.3: Проверить вручную — запрос без верифицированного chatId возвращает 403**

```bash
curl -s -X POST http://localhost:3015/api/session/create \
  -H "Content-Type: application/json" \
  -d '{"chat_id": "100000"}' | jq .
```

Ожидаемый вывод:
```json
{"error": "Access denied. Authorize via Telegram bot @clientzavod_bot first."}
```

- [ ] **Шаг 2.4: Закоммитить**

```bash
cd /root/docker-claw && git add routes/session.routes.js
git commit -m "feat: защитить POST /api/session/create через requireVerifiedChatId"
```

---

## Task 3: Защитить endpoints в apps.routes.js

**Files:**
- Modify: `routes/apps.routes.js:1,141,224`

- [ ] **Шаг 3.1: Добавить require в apps.routes.js**

В `routes/apps.routes.js` добавить импорт после строки 5 (`const manageStore = require('../manage/store');`):

```javascript
const requireVerifiedChatId = require('../middleware/requireVerifiedChatId');
```

- [ ] **Шаг 3.2: Защитить POST /:chat_id/fix/:app_name (строка 141)**

```javascript
// БЫЛО:
router.post('/:chat_id/fix/:app_name', async (req, res) => {

// СТАЛО:
router.post('/:chat_id/fix/:app_name', requireVerifiedChatId(req => req.params.chat_id), async (req, res) => {
```

- [ ] **Шаг 3.3: Защитить POST /:chat_id/:action (строка 224 — сдвинется на 1 после предыдущего шага, станет 225)**

```javascript
// БЫЛО:
router.post('/:chat_id/:action', async (req, res) => {

// СТАЛО:
router.post('/:chat_id/:action', requireVerifiedChatId(req => req.params.chat_id), async (req, res) => {
```

- [ ] **Шаг 3.4: Перезапустить контейнер и проверить вручную — оба эндпоинта отдают 403**

```bash
docker restart bash-executor && sleep 5
curl -s -X POST http://localhost:3015/api/apps/100000/fix/myapp | jq .
```

Ожидаемый вывод:
```json
{"error": "Access denied. Authorize via Telegram bot @clientzavod_bot first."}
```

```bash
curl -s -X POST http://localhost:3015/api/apps/100000/start \
  -H "Content-Type: application/json" \
  -d '{"name": "myapp"}' | jq .
```

Ожидаемый вывод: тот же 403.

- [ ] **Шаг 3.5: Закоммитить**

```bash
cd /root/docker-claw && git add routes/apps.routes.js
git commit -m "feat: защитить POST /api/apps/:chat_id/* через requireVerifiedChatId"
```

---

## Task 4: Защитить /api/manage/* через router.use

**Files:**
- Modify: `routes/index.js:1,19`

- [ ] **Шаг 4.1: Добавить require в routes/index.js**

В `routes/index.js` добавить импорт после строки 2 (`const router = require('express').Router();`):

```javascript
const requireVerifiedChatId = require('../middleware/requireVerifiedChatId');
```

- [ ] **Шаг 4.2: Добавить middleware к /manage**

Заменить строку 19:

```javascript
// БЫЛО:
router.use('/manage', manageRoutes);

// СТАЛО:
router.use('/manage', requireVerifiedChatId(
    req => req.body?.chatId || req.query?.chatId
), manageRoutes);
```

- [ ] **Шаг 4.3: Перезапустить и проверить — /api/manage/* отдаёт 403 без верификации**

```bash
docker restart bash-executor && sleep 5

curl -s -X POST http://localhost:3015/api/manage/channels \
  -H "Content-Type: application/json" \
  -d '{"chatId": "100000"}' | jq .
```

Ожидаемый вывод:
```json
{"error": "Access denied. Authorize via Telegram bot @clientzavod_bot first."}
```

- [ ] **Шаг 4.4: Проверить что верифицированный пользователь проходит**

Взять реальный chatId у которого есть `manage-state-{chatId}.json` с `verifiedTelegramId`:

```bash
# Найти chatId с verifiedTelegramId
grep -l "verifiedTelegramId" /var/sandbox-data/manage-state-*.json | head -1 | grep -o '[0-9]*'
```

Подставить найденный chatId вместо `REAL_CHAT_ID`:

```bash
REAL_CHAT_ID=<найденный chatId>
curl -s -X POST http://localhost:3015/api/manage/channels \
  -H "Content-Type: application/json" \
  -d "{\"chatId\": \"$REAL_CHAT_ID\"}" | jq .
```

Ожидаемый вывод: НЕ 403 (может быть 200 с данными или другой статус, но не Access denied).

- [ ] **Шаг 4.5: Закоммитить**

```bash
cd /root/docker-claw && git add routes/index.js
git commit -m "feat: защитить /api/manage/* через requireVerifiedChatId"
```

---

## Task 5: Итоговая проверка

- [ ] **Шаг 5.1: Запустить все тесты**

```bash
cd /root/docker-claw && npm test
```

Ожидаемый вывод: все тесты проходят, включая `requireVerifiedChatId: 6/6`.

- [ ] **Шаг 5.2: Проверить что старый вектор атаки закрыт**

```bash
# Попытка создать контейнер с вымышленным chatId — должна вернуть 403
curl -s -X POST http://localhost:3015/api/session/create \
  -H "Content-Type: application/json" \
  -d '{"chat_id": "999888777"}' | jq .
```

Ожидаемый вывод:
```json
{"error": "Access denied. Authorize via Telegram bot @clientzavod_bot first."}
```

- [ ] **Шаг 5.3: Убедиться что список контейнеров не изменился (новых не появилось)**

```bash
docker ps --filter name=sandbox-user- --format "{{.Names}}" | sort
```

Список должен совпадать с тем что был до начала реализации.
