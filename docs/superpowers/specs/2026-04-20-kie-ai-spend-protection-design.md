# KIE.ai Spend Protection — Design Spec

**Дата:** 2026-04-20  
**Статус:** Draft  
**Автор:** Claude Code

---

## Context

В апреле 2026 года баг с FK-constraint в WordPress-пайплайне привёл к ~142 лишним вызовам KIE.ai:
- задача падала ПОСЛЕ успешной генерации изображения
- `retry: true` запускал до 5 повторов, каждый заново вызывая KIE.ai
- планировщик добавлял новые задачи каждую минуту, не проверяя глубину очереди
- темы не освобождались при ошибке → очередь росла бесконтрольно

Первопричины уже исправлены. Данный документ описывает структурные защиты, предотвращающие повторение ситуации при любом будущем баге.

---

## Архитектура защит

Четыре независимых слоя, которые работают в связке:

```
scheduleBlogPostsForChat() [каждые 60 сек]
         │
[П1] queueDepth >= dailyLimit? → STOP (тема не резервируется)
         │
Job → handleWordPressGeneration()
         │
[П4] today KIE calls >= KIE_DAILY_LIMIT? → throw KieDailyLimitError → retry:false
         │
blogGenerator.generate() → KIE.ai вызов
         │
[П2] HTTP 402? → throw InsufficientBalanceError → алерт в TG → retry:false
         │
kieAiAlreadyCalled = true  ← [П3 взведён]
         │
createDraftPost / uploadMedia / createWpDraft / markReady
         │  (любой сбой здесь)
[П3] kieAiAlreadyCalled=true → retry:false (KIE.ai не будет вызван повторно)
```

---

## Protection 1 — Queue Overflow Guard

**Файл:** `services/content/worker.js`  
**Функция:** `scheduleBlogPostsForChat` (line ~413)  
**Существующий инструмент:** `queueRepo.getQueueStats(chatId)` → `{queued, processing, done, failed}`

**Проблема:** Планировщик ставит задачи каждую минуту независимо от того, сколько задач уже ждёт в очереди.

**Решение:** Перед `reserveNextTopic` проверить глубину очереди:

```javascript
const stats = await queueRepo.getQueueStats(chatId);
const inFlight = (stats.queued || 0) + (stats.processing || 0);
if (inFlight >= perDayLimit) {
  return; // очередь заполнена до дневного лимита — не добавляем
}
```

Используем `perDayLimit` (уже вычислен выше в функции из `wpConfig.dailyLimit || 3`) как порог — это логично: не стоит ставить в очередь больше задач, чем разрешено в день.

**Попутный фикс:** На строке ~449 сломан вызов `contentLimits.getUsageStats`:
```javascript
// БЫЛО (неправильно):
const publishedToday = await contentLimits.getUsageStats(chatId, contentLimits.QUOTA_TYPES.BLOG_GENERATION);
// СТАЛО (правильно):
const publishedToday = await contentLimits.getUsageStats(chatId, now.date, tz);
if (publishedToday.today.blogGenerated >= perDayLimit) return;
```
Из-за этого бага дневной лимит никогда не срабатывал — `blogGenerated` всегда был 0.

---

## Protection 2 — Alert on KIE.ai 402

**Файлы:**
- `services/inputImageContext.service.js` — бросать типизированную ошибку при 402
- `services/blogGenerator.service.js` — не проглатывать `InsufficientBalanceError`
- `services/content/worker.js` — отправить алерт, вернуть `retry: false`

### 2a. Типизированная ошибка в `inputImageContext.service.js`

В `_generateI2I` (~line 128) и `_generateT2I` (~line 184) после `fetch` к `/api/v1/jobs/createTask`:

```javascript
if (!createResp.ok) {
  if (createResp.status === 402) {
    const err = new Error('KIE.ai insufficient balance (402)');
    err.name = 'InsufficientBalanceError';
    throw err;
  }
  throw new Error(`KIE createTask failed: ${createResp.status}`);
}
```

### 2b. Не проглатывать ошибку в `blogGenerator.service.js` (~line 105)

```javascript
} catch (imgErr) {
  // Не проглатывать критические ошибки — прокинуть наверх
  if (imgErr.name === 'InsufficientBalanceError' || imgErr.name === 'KieDailyLimitError') {
    throw imgErr;
  }
  console.warn(`[BLOG-GENERATOR] Image generation failed: ${imgErr.message}`);
}
```

### 2c. Алерт + retry:false в `handleWordPressGeneration` (worker.js ~line 574)

В catch-блоке (исправить сломанный вызов `alerts.notifyAdmin`):

```javascript
// Алерт модератору
try {
  const data = manageStore.getState(chatId);
  const moderatorId = process.env.CONTENT_MVP_MODERATOR_USER_ID || data?.verifiedTelegramId;
  if (bot && moderatorId) {
    await alerts.sendAlertToModerator(bot, moderatorId, {
      type: e.name === 'InsufficientBalanceError' ? 'kie_insufficient_balance' : 'blog_generation_failed',
      severity: e.name === 'InsufficientBalanceError' ? 'critical' : 'warning',
      message: e.name === 'InsufficientBalanceError'
        ? '🚨 KIE.ai: баланс исчерпан (402) — генерация остановлена'
        : `Ошибка генерации блога: ${e.message}`
    });
  }
} catch (alertErr) {
  console.error('[CONTENT-WORKER-BLOG] Alert failed:', alertErr.message);
}
```

Подпись `sendAlertToModerator(bot, moderatorUserId, alert)` — из `services/content/alerts.js:314`.

---

## Protection 3 — retry:false After Successful KIE.ai Call

**Файл:** `services/content/worker.js`  
**Функция:** `handleWordPressGeneration`

**Проблема:** Если KIE.ai отработал успешно, но последующий шаг (uploadMedia, createWpDraft и т.д.) упал, текущий код возвращает `retry: true`, что приводит к повторному вызову KIE.ai.

**Решение:** Флаг `kieAiAlreadyCalled`:

```javascript
async function handleWordPressGeneration(chatId, job, bot) {
  const { topicId, topic, keywords, techDocId } = job.payload;
  let kieAiAlreadyCalled = false; // ← ДОБАВИТЬ

  try {
    const article = await blogGenerator.generate(chatId, {
      topic, keywords, techDocId, moderatorNote: null
    });
    kieAiAlreadyCalled = true; // ← KIE.ai уже отработал внутри generate()

    // ... шаги 2–7 без изменений ...
    return { success: true };
  } catch (e) {
    // ... release topic, alert ...

    const noRetry = kieAiAlreadyCalled          // ← ОБНОВИТЬ
      || e.name === 'InsufficientBalanceError'
      || e.name === 'KieDailyLimitError'
      || e.message.includes('foreign key constraint');

    return { success: false, error: e.message, retry: !noRetry };
  }
}
```

**Поведение при сбое после KIE.ai:**
- тема освобождается (`releaseTopic` в catch — уже реализовано)
- задача помечается `failed`
- следующий тик планировщика создаст новую задачу с другой темой

---

## Protection 4 — Pre-flight Daily KIE.ai Quota

**Новый файл:** `services/content/kieUsage.repository.js`  
**Изменён:** `services/inputImageContext.service.js`

### Новая таблица в per-user DB

Создаётся через `ensureKieUsageSchema(chatId)` (паттерн как в `queue.repository.js`):

```sql
CREATE TABLE IF NOT EXISTS kie_daily_usage (
  id BIGSERIAL PRIMARY KEY,
  call_date DATE NOT NULL DEFAULT CURRENT_DATE,
  call_count INT NOT NULL DEFAULT 0,
  UNIQUE (call_date)
);
```

Одна таблица на пользователя (в их per-user DB), без `chat_id` колонки (уже изолировано по БД).

### `kieUsage.repository.js` — экспортируемые функции

```javascript
ensureKieUsageSchema(chatId)           // CREATE TABLE IF NOT EXISTS
incrementAndGetKieCallCount(chatId)    // UPSERT + RETURNING call_count
decrementKieCallCount(chatId)          // UPDATE call_count - 1 (откат при превышении лимита)
getKieCallCount(chatId)                // SELECT для текущего дня
```

`incrementAndGetKieCallCount` использует атомарный upsert:
```sql
INSERT INTO kie_daily_usage (call_date, call_count)
VALUES (CURRENT_DATE, 1)
ON CONFLICT (call_date)
DO UPDATE SET call_count = kie_daily_usage.call_count + 1
RETURNING call_count
```

Инкремент происходит **до** вызова KIE.ai (оптимистичный): таймауты и сетевые ошибки тоже считаются как потраченный вызов — это корректная защитная семантика.

### Pre-flight check в `generateImage` (inputImageContext.service.js ~line 285)

```javascript
const KIE_DAILY_LIMIT = parseInt(process.env.KIE_DAILY_LIMIT || '30', 10);
const kieUsageRepo = require('./content/kieUsage.repository');

try {
  await kieUsageRepo.ensureKieUsageSchema(chatId);
  const count = await kieUsageRepo.incrementAndGetKieCallCount(chatId);
  if (count > KIE_DAILY_LIMIT) {
    // Откатываем инкремент
    await kieUsageRepo.decrementKieCallCount(chatId);
    const err = new Error(`KIE.ai daily limit reached: ${count - 1}/${KIE_DAILY_LIMIT}`);
    err.name = 'KieDailyLimitError';
    throw err;
  }
} catch (e) {
  if (e.name === 'KieDailyLimitError') throw e;
  console.warn(`[IMAGE-CTX] KIE usage tracking failed (non-blocking): ${e.message}`);
  // Если трекинг упал по другой причине — не блокируем вызов
}
```

`KIE_DAILY_LIMIT` задаётся через `.env` (по умолчанию 30). В будущем можно вынести в настройки пользователя.

---

## Порядок реализации

| # | Защита | Файлы | Сложность | Время |
|---|--------|-------|-----------|-------|
| 1 | Фикс сломанного `getUsageStats` | worker.js | Тривиально | 15 мин |
| 2 | Queue overflow guard (П1) | worker.js | Низкая | 30 мин |
| 3 | Типизированная ошибка 402 (П2a) | inputImageContext.service.js | Низкая | 30 мин |
| 4 | Не проглатывать ошибку (П2b) | blogGenerator.service.js | Низкая | 15 мин |
| 5 | Алерт + retry:false (П2c) | worker.js | Низкая | 30 мин |
| 6 | `kieAiAlreadyCalled` флаг (П3) | worker.js | Низкая | 30 мин |
| 7 | `kieUsage.repository.js` (П4) | новый файл | Средняя | 1 ч |
| 8 | Pre-flight quota в generateImage (П4) | inputImageContext.service.js | Средняя | 30 мин |
| 9 | Тесты | tests/ | Средняя | 1.5 ч |

**Итого:** ~5.5 часов

---

## Критичные файлы

| Файл | Изменения |
|------|-----------|
| `services/content/worker.js` | П1: overflow guard + fix getUsageStats; П2c: alert; П3: kieAiAlreadyCalled |
| `services/inputImageContext.service.js` | П2a: 402→InsufficientBalanceError; П4: pre-flight check |
| `services/blogGenerator.service.js` | П2b: re-throw InsufficientBalanceError + KieDailyLimitError |
| `services/content/kieUsage.repository.js` | П4: новый файл, 3 функции |

**Существующие функции для переиспользования:**
- `queueRepo.getQueueStats(chatId)` — `services/content/queue.repository.js:298`
- `alerts.sendAlertToModerator(bot, moderatorUserId, alert)` — `services/content/alerts.js:314`
- `contentLimits.getUsageStats(chatId, dateStr, tz)` — `services/content/limits.js:231`
- `manageStore.getState(chatId)` — `manage/store.js`

---

## Тесты

**`tests/blog.generator.test.js`** — добавить:
1. Mock `generateImage` бросает `InsufficientBalanceError` → `generate()` прокидывает (не глотает)
2. Mock `generateImage` бросает `KieDailyLimitError` → аналогично

**`tests/content.status.test.js`** — добавить:
1. `getQueueStats` возвращает `{queued: 3}`, `perDayLimit = 3` → `reserveNextTopic` не вызван
2. `blogGenerator.generate()` успешен, `createDraftPost` бросает → результат содержит `retry: false`

**Новый `tests/kieUsage.test.js`:**
1. Инкремент + получение счётчика с mock-клиентом
2. Pre-flight check блокирует при `count > limit`
3. Блокировка не происходит при сбое трекинга (fail-open)

---

## Верификация

1. Поднять сервер, настроить `KIE_DAILY_LIMIT=2` в `.env.local`
2. Вручную поставить 3 задачи `wordpress_generate` подряд — третья должна вернуть `KieDailyLimitError` без вызова KIE.ai
3. Установить баланс KIE.ai в 0 → следующая генерация должна прислать алерт в Telegram
4. Заполнить очередь до `perDayLimit` задач → следующий тик планировщика не добавляет новых
5. Запустить `npm test` — все тесты зелёные
