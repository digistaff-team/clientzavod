# KIE.ai Spend Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить 4 защитных слоя против неконтролируемых расходов KIE.ai при сбоях в коде.

**Architecture:** П1 — ограничение глубины очереди планировщика; П2 — типизированные ошибки и Telegram-алерт при 402; П3 — флаг `kieAiAlreadyCalled` запрещает retry после успешного вызова KIE.ai; П4 — атомарный счётчик вызовов в per-user БД с pre-flight проверкой в `generateImage`.

**Tech Stack:** Node.js 18, PostgreSQL 15 (per-user DB), Telegraf (Telegram bot), `node-fetch` для KIE.ai API.

---

## File Map

| Файл | Действие | Что меняется |
|------|----------|-------------|
| `services/content/worker.js` | Modify | П1: overflow guard + fix getUsageStats; П2c: alert; П3: kieAiAlreadyCalled |
| `services/inputImageContext.service.js` | Modify | П2a: 402→InsufficientBalanceError; П4: pre-flight quota |
| `services/blogGenerator.service.js` | Modify | П2b: re-throw InsufficientBalanceError + KieDailyLimitError |
| `services/content/kieUsage.repository.js` | **Create** | П4: ensureKieUsageSchema, incrementAndGetKieCallCount, decrementKieCallCount, getKieCallCount |
| `tests/blog.generator.test.js` | Modify | 2 новых теста: InsufficientBalanceError и KieDailyLimitError пробрасываются |
| `tests/kieUsage.test.js` | **Create** | Тесты для kieUsage.repository |

---

## Task 1: Fix broken getUsageStats call + Queue Overflow Guard (П1)

**Files:**
- Modify: `services/content/worker.js` (lines 447–462)

Текущий баг: `contentLimits.getUsageStats(chatId, contentLimits.QUOTA_TYPES.BLOG_GENERATION)` передаёт строку `'blog_generation'` как `dateStr` — возвращает `blogGenerated: 0` всегда. Плюс нет проверки глубины очереди.

- [ ] **Step 1: Прочитать текущий код** строк 413–480 в `services/content/worker.js` (убедиться что видим актуальную версию)

- [ ] **Step 2: Заменить блок проверки лимитов (строки 447–462)**

Найти в `services/content/worker.js`:
```javascript
  // Проверяем лимиты
  const perDayLimit = wpConfig.dailyLimit || wpConfig.postsPerDay || 3;
  const publishedToday = await contentLimits.getUsageStats(chatId, contentLimits.QUOTA_TYPES.BLOG_GENERATION);
  if (publishedToday.today >= perDayLimit) {
    return;
  }

  // Проверяем minIntervalHours (минимальный интервал между постами)
  if (wpConfig.minIntervalHours && wpConfig.lastPublishedAt) {
    const hoursSince = (Date.now() - new Date(wpConfig.lastPublishedAt).getTime()) / 3600000;
    if (hoursSince < wpConfig.minIntervalHours) return;
  }

  // Выбираем следующую тему (резервируем её)
```

Заменить на:
```javascript
  // Проверяем лимиты
  const perDayLimit = wpConfig.dailyLimit || wpConfig.postsPerDay || 3;
  const publishedToday = await contentLimits.getUsageStats(chatId, now.date, tz);
  if (publishedToday.today.blogGenerated >= perDayLimit) {
    return;
  }

  // [П1] Queue overflow guard: не добавляем в очередь если уже достаточно задач
  const queueStats = await queueRepo.getQueueStats(chatId);
  const inFlight = (queueStats.queued || 0) + (queueStats.processing || 0);
  if (inFlight >= perDayLimit) {
    return;
  }

  // Проверяем minIntervalHours (минимальный интервал между постами)
  if (wpConfig.minIntervalHours && wpConfig.lastPublishedAt) {
    const hoursSince = (Date.now() - new Date(wpConfig.lastPublishedAt).getTime()) / 3600000;
    if (hoursSince < wpConfig.minIntervalHours) return;
  }

  // Выбираем следующую тему (резервируем её)
```

- [ ] **Step 3: Убедиться что `queueRepo` уже импортирован**

Проверить что в начале `worker.js` есть строка вида `const queueRepo = require(...)`. Если нет — добавить в импорты. (По данным исследования, `queueRepo` импортирован на строке 6.)

- [ ] **Step 4: Запустить сервер и проверить что нет синтаксических ошибок**

```bash
node -e "require('./services/content/worker')" && echo "OK"
```
Ожидаемый вывод: `OK` (или ошибки подключения к БД, но не синтаксические).

- [ ] **Step 5: Commit**

```bash
git add services/content/worker.js
git commit -m "fix: repair getUsageStats call and add P1 queue overflow guard"
```

---

## Task 2: Typed error for KIE.ai 402 (П2a)

**Files:**
- Modify: `services/inputImageContext.service.js` (lines ~128 and ~184)

Оба метода `_generateI2I` и `_generateT2I` при ошибке HTTP бросают обычный `Error`. Нужно выделить 402 в именованную ошибку `InsufficientBalanceError`.

- [ ] **Step 1: Исправить `_generateI2I` (~line 128)**

Найти в `services/inputImageContext.service.js`:
```javascript
  if (!createResp.ok) {
    const err = await createResp.text();
    throw new Error(`KIE i2i createTask failed: ${createResp.status} ${err.slice(0, 300)}`);
  }
```

Заменить на:
```javascript
  if (!createResp.ok) {
    if (createResp.status === 402) {
      const balanceErr = new Error('KIE.ai insufficient balance (402)');
      balanceErr.name = 'InsufficientBalanceError';
      throw balanceErr;
    }
    const errText = await createResp.text();
    throw new Error(`KIE i2i createTask failed: ${createResp.status} ${errText.slice(0, 300)}`);
  }
```

- [ ] **Step 2: Исправить `_generateT2I` (~line 184)**

Найти в `services/inputImageContext.service.js`:
```javascript
  if (!createResp.ok) {
    const err = await createResp.text();
    throw new Error(`Image t2i createTask failed: ${createResp.status} ${err.slice(0, 300)}`);
  }
```

Заменить на:
```javascript
  if (!createResp.ok) {
    if (createResp.status === 402) {
      const balanceErr = new Error('KIE.ai insufficient balance (402)');
      balanceErr.name = 'InsufficientBalanceError';
      throw balanceErr;
    }
    const errText = await createResp.text();
    throw new Error(`Image t2i createTask failed: ${createResp.status} ${errText.slice(0, 300)}`);
  }
```

- [ ] **Step 3: Проверить синтаксис**

```bash
node -e "require('./services/inputImageContext.service')" && echo "OK"
```
Ожидаемый вывод: `OK`.

- [ ] **Step 4: Commit**

```bash
git add services/inputImageContext.service.js
git commit -m "fix: throw typed InsufficientBalanceError on KIE.ai 402 response"
```

---

## Task 3: Re-throw critical errors in blogGenerator (П2b)

**Files:**
- Modify: `services/blogGenerator.service.js` (lines ~105–109)

Сейчас все ошибки `generateImage` проглатываются. `InsufficientBalanceError` и `KieDailyLimitError` (появится в Task 5) должны пробрасываться наверх.

- [ ] **Step 1: Исправить catch-блок (~lines 105–109)**

Найти в `services/blogGenerator.service.js`:
```javascript
  } catch (imgErr) {
    console.warn(`[BLOG-GENERATOR] Image generation failed, continuing without image: ${imgErr.message}`);
  }
```

Заменить на:
```javascript
  } catch (imgErr) {
    if (imgErr.name === 'InsufficientBalanceError' || imgErr.name === 'KieDailyLimitError') {
      throw imgErr; // критические ошибки — не продолжать, пробросить наверх
    }
    console.warn(`[BLOG-GENERATOR] Image generation failed, continuing without image: ${imgErr.message}`);
  }
```

- [ ] **Step 2: Проверить синтаксис**

```bash
node -e "require('./services/blogGenerator.service')" && echo "OK"
```
Ожидаемый вывод: `OK`.

- [ ] **Step 3: Commit**

```bash
git add services/blogGenerator.service.js
git commit -m "fix: re-throw InsufficientBalanceError and KieDailyLimitError from blogGenerator"
```

---

## Task 4: Alert + retry:false in handleWordPressGeneration (П2c + П3)

**Files:**
- Modify: `services/content/worker.js` (функция `handleWordPressGeneration`, ~lines 486–605)

Два изменения в одной функции: (1) флаг `kieAiAlreadyCalled` для П3; (2) правильный вызов `alerts.sendAlertToModerator` для П2c.

- [ ] **Step 1: Добавить флаг `kieAiAlreadyCalled`**

Найти в `services/content/worker.js`:
```javascript
async function handleWordPressGeneration(chatId, job, bot) {
  const { topicId, topic, keywords, techDocId } = job.payload;
  const corrId = job.correlation_id || generateCorrelationId();
```

Заменить на:
```javascript
async function handleWordPressGeneration(chatId, job, bot) {
  const { topicId, topic, keywords, techDocId } = job.payload;
  const corrId = job.correlation_id || generateCorrelationId();
  let kieAiAlreadyCalled = false; // [П3] взводится после успешного вызова blogGenerator.generate()
```

- [ ] **Step 2: Установить флаг после успешного `generate()`**

Найти в `services/content/worker.js`:
```javascript
    const article = await blogGenerator.generate(chatId, {
      topic,
      keywords,
      techDocId,
      moderatorNote: null
    });

    console.log(`[CONTENT-WORKER-BLOG] Article generated: ${article.seoTitle}`);
```

Заменить на:
```javascript
    const article = await blogGenerator.generate(chatId, {
      topic,
      keywords,
      techDocId,
      moderatorNote: null
    });
    kieAiAlreadyCalled = true; // [П3] KIE.ai вызван внутри generate() — дальнейшие ретраи не должны вызывать его снова

    console.log(`[CONTENT-WORKER-BLOG] Article generated: ${article.seoTitle}`);
```

- [ ] **Step 3: Исправить catch-блок — alert и noRetry**

Найти в `services/content/worker.js`:
```javascript
    // Уведомляем админа
    try {
      await alerts.sendAlertToModerator(chatId, `Blog generation failed: ${e.message}`);
    } catch (alertError) {
      console.error('[CONTENT-WORKER-BLOG] Failed to send alert:', alertError.message);
    }

    const noRetry = e.name === 'InsufficientBalanceError' || e.message.includes('foreign key constraint');
    return { success: false, error: e.message, retry: !noRetry };
```

Заменить на:
```javascript
    // [П2c] Алерт модератору с правильной сигнатурой sendAlertToModerator(bot, userId, alert)
    try {
      const stateData = manageStore.getState(chatId);
      const moderatorId = process.env.CONTENT_MVP_MODERATOR_USER_ID || stateData?.verifiedTelegramId;
      if (bot && moderatorId) {
        await alerts.sendAlertToModerator(bot, moderatorId, {
          type: e.name === 'InsufficientBalanceError' ? 'kie_insufficient_balance'
              : e.name === 'KieDailyLimitError' ? 'kie_daily_limit'
              : 'blog_generation_failed',
          severity: (e.name === 'InsufficientBalanceError' || e.name === 'KieDailyLimitError') ? 'critical' : 'warning',
          message: e.name === 'InsufficientBalanceError'
            ? '🚨 KIE.ai: баланс исчерпан (402) — генерация остановлена'
            : e.name === 'KieDailyLimitError'
            ? `🚨 KIE.ai: достигнут дневной лимит вызовов — генерация остановлена`
            : `Ошибка генерации блога: ${e.message}`
        });
      }
    } catch (alertError) {
      console.error('[CONTENT-WORKER-BLOG] Failed to send alert:', alertError.message);
    }

    // [П3] retry:false если KIE.ai уже был вызван — не тратить токены повторно
    const noRetry = kieAiAlreadyCalled
      || e.name === 'InsufficientBalanceError'
      || e.name === 'KieDailyLimitError'
      || e.message.includes('foreign key constraint');
    return { success: false, error: e.message, retry: !noRetry };
```

- [ ] **Step 4: Убедиться что `manageStore` импортирован в worker.js**

```bash
grep -n "require.*manage/store\|manageStore" services/content/worker.js | head -5
```
Если нет — добавить в импорты: `const manageStore = require('../../manage/store');`

- [ ] **Step 5: Проверить синтаксис**

```bash
node -e "require('./services/content/worker')" && echo "OK"
```

- [ ] **Step 6: Commit**

```bash
git add services/content/worker.js
git commit -m "feat: add P2c alert and P3 retry:false after KIE.ai call in handleWordPressGeneration"
```

---

## Task 5: Create kieUsage.repository.js (П4 — часть 1)

**Files:**
- Create: `services/content/kieUsage.repository.js`

Новый репозиторий для атомарного счётчика вызовов KIE.ai в per-user PostgreSQL БД. Паттерн (withClient, DDL в ensureSchema) такой же, как в `services/content/queue.repository.js`.

- [ ] **Step 1: Написать failing-тест**

Создать файл `tests/kieUsage.test.js`:

```javascript
/**
 * Tests for kieUsage.repository.js
 */
const assert = require('assert');

// Mock per-user DB client
let mockCallCount = 0;
const mockClient = {
  query: async (sql, params) => {
    if (sql.includes('CREATE TABLE')) return { rows: [] };
    if (sql.includes('INSERT INTO kie_daily_usage')) {
      mockCallCount++;
      return { rows: [{ call_count: mockCallCount }] };
    }
    if (sql.includes('UPDATE kie_daily_usage SET call_count = kie_daily_usage.call_count - 1')) {
      mockCallCount = Math.max(0, mockCallCount - 1);
      return { rows: [] };
    }
    if (sql.includes('SELECT call_count')) {
      return { rows: [{ call_count: mockCallCount }] };
    }
    return { rows: [] };
  }
};

// Mock repository.withClient
require.cache[require.resolve('../services/content/repository')] = {
  id: require.resolve('../services/content/repository'),
  filename: require.resolve('../services/content/repository'),
  loaded: true,
  exports: {
    withClient: async (chatId, fn) => fn(mockClient)
  }
};

const kieUsage = require('../services/content/kieUsage.repository');

async function testIncrementAndGet() {
  console.log('Test: increment and get KIE call count');
  mockCallCount = 0;

  const count1 = await kieUsage.incrementAndGetKieCallCount('testChat');
  assert.strictEqual(count1, 1, 'First increment should return 1');

  const count2 = await kieUsage.incrementAndGetKieCallCount('testChat');
  assert.strictEqual(count2, 2, 'Second increment should return 2');

  const current = await kieUsage.getKieCallCount('testChat');
  assert.strictEqual(current, 2, 'getKieCallCount should return 2');

  console.log('✓ increment and get passed\n');
}

async function testDecrement() {
  console.log('Test: decrement KIE call count');
  mockCallCount = 5;

  await kieUsage.decrementKieCallCount('testChat');
  const current = await kieUsage.getKieCallCount('testChat');
  assert.strictEqual(current, 4, 'After decrement should be 4');

  console.log('✓ decrement passed\n');
}

async function testEnsureSchemaIsIdempotent() {
  console.log('Test: ensureKieUsageSchema is idempotent (no throw)');
  await kieUsage.ensureKieUsageSchema('testChat');
  await kieUsage.ensureKieUsageSchema('testChat'); // second call should not throw
  console.log('✓ ensureSchema idempotent passed\n');
}

async function runTests() {
  console.log('=== KIE Usage Repository Tests ===\n');
  let passed = 0, failed = 0;
  for (const fn of [testIncrementAndGet, testDecrement, testEnsureSchemaIsIdempotent]) {
    try {
      await fn();
      passed++;
    } catch (e) {
      console.error(`✗ ${fn.name} FAILED: ${e.message}`);
      failed++;
    }
  }
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

```bash
node tests/kieUsage.test.js
```
Ожидаемый вывод: ошибка `Cannot find module '../services/content/kieUsage.repository'`

- [ ] **Step 3: Создать `services/content/kieUsage.repository.js`**

```javascript
/**
 * KIE.ai Daily Usage Repository
 * Атомарный счётчик вызовов KIE.ai в per-user PostgreSQL БД.
 * Таблица создаётся при первом вызове ensureKieUsageSchema().
 */
const { withClient } = require('./repository');

const DDL = `
  CREATE TABLE IF NOT EXISTS kie_daily_usage (
    id BIGSERIAL PRIMARY KEY,
    call_date DATE NOT NULL DEFAULT CURRENT_DATE,
    call_count INT NOT NULL DEFAULT 0,
    UNIQUE (call_date)
  )
`;

async function ensureKieUsageSchema(chatId) {
  return withClient(chatId, async (client) => {
    await client.query(DDL);
  });
}

async function incrementAndGetKieCallCount(chatId) {
  return withClient(chatId, async (client) => {
    const result = await client.query(
      `INSERT INTO kie_daily_usage (call_date, call_count)
       VALUES (CURRENT_DATE, 1)
       ON CONFLICT (call_date)
       DO UPDATE SET call_count = kie_daily_usage.call_count + 1
       RETURNING call_count`
    );
    return result.rows[0].call_count;
  });
}

async function decrementKieCallCount(chatId) {
  return withClient(chatId, async (client) => {
    await client.query(
      `UPDATE kie_daily_usage
       SET call_count = GREATEST(0, call_count - 1)
       WHERE call_date = CURRENT_DATE`
    );
  });
}

async function getKieCallCount(chatId) {
  return withClient(chatId, async (client) => {
    const result = await client.query(
      `SELECT call_count FROM kie_daily_usage WHERE call_date = CURRENT_DATE`
    );
    return result.rows[0]?.call_count || 0;
  });
}

module.exports = {
  ensureKieUsageSchema,
  incrementAndGetKieCallCount,
  decrementKieCallCount,
  getKieCallCount
};
```

- [ ] **Step 4: Запустить тест — убедиться что проходит**

```bash
node tests/kieUsage.test.js
```
Ожидаемый вывод:
```
=== KIE Usage Repository Tests ===

Test: increment and get KIE call count
✓ increment and get passed

Test: decrement KIE call count
✓ decrement passed

Test: ensureKieUsageSchema is idempotent (no throw)
✓ ensureSchema idempotent passed

=== Results: 3 passed, 0 failed ===
```

- [ ] **Step 5: Commit**

```bash
git add services/content/kieUsage.repository.js tests/kieUsage.test.js
git commit -m "feat: add kieUsage.repository with daily call counter and tests"
```

---

## Task 6: Pre-flight KIE.ai quota in generateImage (П4 — часть 2)

**Files:**
- Modify: `services/inputImageContext.service.js` (функция `generateImage`, ~line 285)

Добавляем pre-flight проверку перед вызовом KIE.ai. Лимит берётся из `process.env.KIE_DAILY_LIMIT` (по умолчанию 30). Если трекинг упал по технической причине — не блокируем вызов (fail-open).

- [ ] **Step 1: Прочитать начало функции `generateImage`**

```bash
grep -n "async function generateImage" services/inputImageContext.service.js
```
Запомни номер строки.

- [ ] **Step 2: Добавить pre-flight блок в начало `generateImage`**

Найти в `services/inputImageContext.service.js` первые строки функции `generateImage`:
```javascript
async function generateImage(chatId, basePrompt, aspectRatio, t2iModel, channel = 'unknown') {
  const tag = `[IMAGE-CTX][${channel}][${chatId}]`;
```

Заменить на:
```javascript
async function generateImage(chatId, basePrompt, aspectRatio, t2iModel, channel = 'unknown') {
  const tag = `[IMAGE-CTX][${channel}][${chatId}]`;

  // [П4] Pre-flight: проверяем дневной лимит вызовов KIE.ai
  const KIE_DAILY_LIMIT = parseInt(process.env.KIE_DAILY_LIMIT || '30', 10);
  const kieUsageRepo = require('./content/kieUsage.repository');
  try {
    await kieUsageRepo.ensureKieUsageSchema(chatId);
    const count = await kieUsageRepo.incrementAndGetKieCallCount(chatId);
    if (count > KIE_DAILY_LIMIT) {
      await kieUsageRepo.decrementKieCallCount(chatId); // откат оптимистичного инкремента
      const limitErr = new Error(`KIE.ai daily limit reached: ${count - 1}/${KIE_DAILY_LIMIT}`);
      limitErr.name = 'KieDailyLimitError';
      throw limitErr;
    }
    console.log(`${tag} KIE daily usage: ${count}/${KIE_DAILY_LIMIT}`);
  } catch (e) {
    if (e.name === 'KieDailyLimitError') throw e; // пробрасываем — это не техническая ошибка
    console.warn(`${tag} KIE usage tracking failed (non-blocking): ${e.message}`);
    // Если трекинг упал по технической причине — не блокируем вызов
  }
```

- [ ] **Step 3: Проверить синтаксис**

```bash
node -e "require('./services/inputImageContext.service')" && echo "OK"
```

- [ ] **Step 4: Проверить что `KIE_DAILY_LIMIT` добавлен в документацию**

Добавить в `.env.local` (для тестирования):
```
KIE_DAILY_LIMIT=2
```

- [ ] **Step 5: Commit**

```bash
git add services/inputImageContext.service.js
git commit -m "feat: add P4 pre-flight KIE.ai daily quota check in generateImage"
```

---

## Task 7: Tests for blogGenerator error propagation

**Files:**
- Modify: `tests/blog.generator.test.js`

Добавляем 2 теста: `InsufficientBalanceError` и `KieDailyLimitError` пробрасываются из `generate()`, а не проглатываются.

- [ ] **Step 1: Добавить мок `inputImageContext.service` в `blog.generator.test.js`**

Найти в `tests/blog.generator.test.js` блок с импортами после всех `require.cache` установок, перед строкой:
```javascript
// Импортируем генератор
const blogGenerator = require('../services/blogGenerator.service');
```

Вставить перед этой строкой:
```javascript
// Мокаем inputImageContext.service
let mockGenerateImageFn = async () => Buffer.from('fakeimagedata');
require.cache[require.resolve('../services/inputImageContext.service')] = {
  id: require.resolve('../services/inputImageContext.service'),
  filename: require.resolve('../services/inputImageContext.service'),
  loaded: true,
  exports: {
    generateImage: async (...args) => mockGenerateImageFn(...args)
  }
};

// Мокаем channelSkills
require.cache[require.resolve('../services/channelSkills')] = {
  id: require.resolve('../services/channelSkills'),
  filename: require.resolve('../services/channelSkills'),
  loaded: true,
  exports: {
    buildSystemPrompt: async (skill, base) => base
  }
};

// Мокаем manage/store
require.cache[require.resolve('../manage/store')] = {
  id: require.resolve('../manage/store'),
  filename: require.resolve('../manage/store'),
  loaded: true,
  exports: {
    getImageGenSettings: () => ({ model: 'nano-banana-2' })
  }
};
```

- [ ] **Step 2: Добавить два новых теста перед `runTests()`**

Найти в `tests/blog.generator.test.js`:
```javascript
// ============================================
// Запуск
// ============================================

async function runTests() {
```

Вставить перед этим блоком:
```javascript
async function testInsufficientBalanceErrorPropagates() {
  console.log('Test: InsufficientBalanceError from generateImage propagates out of generate()');

  const originalFn = mockGenerateImageFn;
  mockGenerateImageFn = async () => {
    const err = new Error('KIE.ai insufficient balance (402)');
    err.name = 'InsufficientBalanceError';
    throw err;
  };

  // Перезагружаем blogGenerator чтобы подхватить новый мок
  delete require.cache[require.resolve('../services/blogGenerator.service')];
  const freshGenerator = require('../services/blogGenerator.service');

  try {
    await freshGenerator.generate('testChat', { topic: 'Test', keywords: 'keys' });
    assert.fail('Should have thrown InsufficientBalanceError');
  } catch (e) {
    assert.strictEqual(e.name, 'InsufficientBalanceError', `Expected InsufficientBalanceError, got ${e.name}: ${e.message}`);
    console.log('✓ InsufficientBalanceError propagation passed\n');
  } finally {
    mockGenerateImageFn = originalFn;
    delete require.cache[require.resolve('../services/blogGenerator.service')];
  }
}

async function testKieDailyLimitErrorPropagates() {
  console.log('Test: KieDailyLimitError from generateImage propagates out of generate()');

  const originalFn = mockGenerateImageFn;
  mockGenerateImageFn = async () => {
    const err = new Error('KIE.ai daily limit reached: 30/30');
    err.name = 'KieDailyLimitError';
    throw err;
  };

  delete require.cache[require.resolve('../services/blogGenerator.service')];
  const freshGenerator = require('../services/blogGenerator.service');

  try {
    await freshGenerator.generate('testChat', { topic: 'Test', keywords: 'keys' });
    assert.fail('Should have thrown KieDailyLimitError');
  } catch (e) {
    assert.strictEqual(e.name, 'KieDailyLimitError', `Expected KieDailyLimitError, got ${e.name}: ${e.message}`);
    console.log('✓ KieDailyLimitError propagation passed\n');
  } finally {
    mockGenerateImageFn = originalFn;
    delete require.cache[require.resolve('../services/blogGenerator.service')];
  }
}
```

- [ ] **Step 3: Зарегистрировать новые тесты в `runTests()`**

Найти в `tests/blog.generator.test.js`:
```javascript
  const tests = [
    testGenerateReturnsCorrectShape,
    testAICallOrder,
    testImageGenerationCalled,
    testInsufficientBalance,
    testModeratorNoteInPrompt,
    testSlugSanitization
  ];
```

Заменить на:
```javascript
  const tests = [
    testGenerateReturnsCorrectShape,
    testAICallOrder,
    testImageGenerationCalled,
    testInsufficientBalance,
    testModeratorNoteInPrompt,
    testSlugSanitization,
    testInsufficientBalanceErrorPropagates,
    testKieDailyLimitErrorPropagates
  ];
```

- [ ] **Step 4: Запустить тесты**

```bash
node tests/blog.generator.test.js
```
Ожидаемый вывод: все тесты зелёные, включая 2 новых. Если старые тесты падают из-за конфликта моков — убедиться что `mockGenerateImageFn` восстанавливается в `finally`.

- [ ] **Step 5: Commit**

```bash
git add tests/blog.generator.test.js
git commit -m "test: add error propagation tests for InsufficientBalanceError and KieDailyLimitError"
```

---

## Task 8: Full test run and restart

- [ ] **Step 1: Запустить все тесты**

```bash
npm test
```
Ожидаемый вывод: все тесты зелёные.

- [ ] **Step 2: Добавить `KIE_DAILY_LIMIT` в `.env.local` для проверки**

```bash
echo "KIE_DAILY_LIMIT=2" >> .env.local
```

- [ ] **Step 3: Перезапустить сервер**

```bash
docker-compose restart app
```

- [ ] **Step 4: Проверить логи на отсутствие ошибок запуска**

```bash
docker logs bash-executor --tail 30 2>&1 | grep -E "ERROR|WARN|error" | head -10
```
Ожидаемый вывод: только обычные предупреждения, никаких синтаксических ошибок.

- [ ] **Step 5: Ручная верификация П1 (queue overflow)**

```bash
docker exec bash-executor node -e "
const { Pool } = require('pg');
const pool = new Pool({ host:'postgres', port:5432, user:'postgres', password:process.env.PG_PASSWORD, database:'db_990065788' });
pool.query(\"SELECT status, COUNT(*) FROM content_job_queue WHERE job_type='wordpress_generate' GROUP BY status\").then(r => { console.log(JSON.stringify(r.rows)); pool.end(); });
" 2>&1
```
Если `queued + processing >= perDayLimit` — следующий тик планировщика не должен добавлять новых задач (проверить в логах: нет строки `Enqueued blog post generation`).

- [ ] **Step 6: Убрать тестовый лимит**

```bash
# Убрать KIE_DAILY_LIMIT=2 из .env.local или установить нормальное значение
# Например: KIE_DAILY_LIMIT=30
```

- [ ] **Step 7: Финальный commit**

```bash
git add .env.local  # если изменяли
git commit -m "chore: set KIE_DAILY_LIMIT=30 in .env.local"
```

---

## Self-Review Checklist

- [x] **П1 Queue overflow guard** → Task 1 (worker.js `scheduleBlogPostsForChat`)
- [x] **Фикс сломанного getUsageStats** → Task 1 (worker.js, `publishedToday.today.blogGenerated`)
- [x] **П2a typed error 402** → Task 2 (inputImageContext.service.js `_generateI2I` и `_generateT2I`)
- [x] **П2b re-throw в blogGenerator** → Task 3 (blogGenerator.service.js catch-блок)
- [x] **П2c alert + retry:false** → Task 4 (worker.js `handleWordPressGeneration` catch)
- [x] **П3 kieAiAlreadyCalled флаг** → Task 4 (worker.js `handleWordPressGeneration`)
- [x] **П4 kieUsage.repository.js** → Task 5 (новый файл + тесты)
- [x] **П4 pre-flight в generateImage** → Task 6 (inputImageContext.service.js)
- [x] **Тесты blogGenerator** → Task 7 (два новых теста)
- [x] **Тесты kieUsage** → Task 5 (kieUsage.test.js)
