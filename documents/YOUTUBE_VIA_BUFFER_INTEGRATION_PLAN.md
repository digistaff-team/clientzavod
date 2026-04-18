# АГЕНТНЫЙ ПЛАН: Интеграция публикации YouTube → Buffer GraphQL API

> **Для AI-агента:** Выполняй фазы строго последовательно.
> После каждой фазы — заполни шаблон отчёта и **добавь** его в этот документ
> в раздел с соответствующей фазой (append, не перезаписывай весь файл).
> Если шаг завершился ошибкой — запиши причину в отчёт и **остановись**.

---

## Контекст

YouTube — единственный канал со статусом "Coming soon" в `public/channels.html`.
Все остальные каналы (Telegram, VK, OK, Pinterest, Instagram) уже реализованы.

Публикация в Pinterest и Instagram уже идёт через Buffer GraphQL API
(`services/buffer.service.js`). Пользователь вводит Buffer API Key и Channel ID
вручную в UI — без OAuth flow.

YouTube нужно интегрировать по **тому же паттерну**, что и Pinterest:
отдельный MVP-сервис, отдельный DB-репозиторий, конфиг в `manage/store.js`,
роуты в `manage/routes.js`, планировщик и модерация в `server.js`.

Аналогичный паттерн для Pinterest: `documents/PINTEREST_VIA_BUFFER_INTEGRATION_PLAN.md`.
Настройка Buffer для Instagram: `documents/INSTAGRAM_BUFFER_SETUP.md`.

### Предпосылка (Фаза 0)

Buffer поддерживает YouTube как канал. Пользователь подключает YouTube-аккаунт
в личном кабинете Buffer, получает Channel ID типа `service: 'youtube'`.
Публикация идёт через мутацию `createPost` — тот же endpoint, что и для Pinterest.

Ключевое отличие от Pinterest: YouTube требует **видео** (или Shorts), а не
изображение. Buffer принимает публичный URL видеофайла в `assets`.

---

## Статус фаз

| Фаза | Описание | Статус |
|------|----------|--------|
| 0 | Верификация поддержки YouTube в Buffer API | ⬜ |
| 1 | DB-репозиторий `youtube.repository.js` | ⬜ |
| 2 | Конфиг в `manage/store.js` | ⬜ |
| 3 | Расширение `buffer.service.js` | ⬜ |
| 4 | MVP-сервис `youtubeMvp.service.js` | ⬜ |
| 5 | API-роуты в `manage/routes.js` | ⬜ |
| 6 | Планировщик и модерация в `server.js` | ⬜ |
| 7 | Schema stub в `repository.js` | ⬜ |
| 8 | AI-контекст: `context.js` + `prompts.js` | ⬜ |
| 9 | Frontend: `channels.html` + `channels.js` | ⬜ |
| 10 | Интеграционное тестирование | ⬜ |

---

## ФАЗА 0: Верификация поддержки YouTube в Buffer API

### Цель

Убедиться, что Buffer GraphQL API принимает YouTube-каналы и позволяет создавать
посты через мутацию `createPost`.

### Шаги

1. Получить Buffer API Key (из существующего аккаунта или нового)
2. Подключить YouTube-канал в личном кабинете Buffer (`Add Channel → YouTube`)
3. Получить Channel ID через GraphQL:

```bash
curl -X POST https://api.buffer.com/graphql \
  -H "Authorization: Bearer YOUR_BUFFER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { channels(input: { organizationId: \"YOUR_ORG_ID\" }) { id name service } }"
  }'
```

4. Проверить что в ответе есть канал с `"service": "youtube"`
5. Проверить тест-соединение через существующую функцию:

```javascript
const { testConnection } = require('./services/buffer.service');
const result = await testConnection(apiKey, youtubeChannelId);
// Ожидаем: { ok: true, channelName: '...', service: 'youtube' }
```

6. Проверить создание поста с видео-ассетом:

```bash
curl -X POST https://api.buffer.com/graphql \
  -H "Authorization: Bearer YOUR_BUFFER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation CreatePost($input: CreatePostInput!) { createPost(input: $input) { __typename ... on PostActionSuccess { post { id status } } ... on UnexpectedError { message } ... on InvalidInputError { message } } }",
    "variables": {
      "input": {
        "channelId": "YOUR_YOUTUBE_CHANNEL_ID",
        "text": "Тестовое описание видео",
        "schedulingType": "automatic",
        "mode": "shareNow",
        "assets": {
          "video": { "url": "https://example.com/test-video.mp4" }
        }
      }
    }
  }'
```

### Критерий успеха

- `testConnection` возвращает `service: 'youtube'`
- `createPost` возвращает `PostActionSuccess` с `post.id`

---

## ФАЗА 1: DB-репозиторий

### Файл для создания: `services/content/youtube.repository.js`

Шаблон: `services/content/pinterest.repository.js` (~313 строк).

### Таблицы в per-user БД (`db_{chatId}`)

**`youtube_jobs`:**
```sql
CREATE TABLE IF NOT EXISTS youtube_jobs (
  id BIGSERIAL PRIMARY KEY,
  chat_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  video_title TEXT,
  video_description TEXT,
  tags TEXT,
  thumbnail_prompt TEXT,
  thumbnail_path TEXT,
  video_path TEXT,
  video_url TEXT,
  link TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  error_text TEXT,
  thumbnail_attempts INT NOT NULL DEFAULT 0,
  rejected_count INT NOT NULL DEFAULT 0,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_youtube_jobs_status ON youtube_jobs(status);
CREATE INDEX IF NOT EXISTS idx_youtube_jobs_chat_id ON youtube_jobs(chat_id);
```

**`youtube_publish_logs`:**
```sql
CREATE TABLE IF NOT EXISTS youtube_publish_logs (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT REFERENCES youtube_jobs(id) ON DELETE SET NULL,
  buffer_post_id TEXT,
  status TEXT NOT NULL,
  error_text TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Функции для реализации

Копировать из `pinterest.repository.js`, адаптировать имена таблиц:

```javascript
module.exports = {
  ensureSchema,         // CREATE TABLE IF NOT EXISTS
  createJob,            // INSERT INTO youtube_jobs
  updateJob,            // UPDATE youtube_jobs SET ...
  getJobById,           // SELECT * FROM youtube_jobs WHERE id = $1
  listJobs,             // SELECT с пагинацией и фильтрами
  addPublishLog,        // INSERT INTO youtube_publish_logs
  countPublishedToday,  // SELECT COUNT(*) WHERE status='published' AND date=today
  getPool               // Возврат pg Pool для chatId
};
```

---

## ФАЗА 2: Конфиг в manage/store.js

### Контекст

Все каналы хранят credentials в `manage/store.js` → in-memory `statesCache` →
файлы `{DATA_ROOT}/manage-state-{chatId}.json`.

Референс: `manage/store.js:562-593` — Pinterest getter/setter/clear.

### Добавить после блока Instagram (~строка 631)

```javascript
// === YouTube Config ===

function getYoutubeConfig(chatId) {
    const data = statesCache[chatId];
    return data?.youtubeConfig || null;
}

function setYoutubeConfig(chatId, patch = {}) {
    if (!statesCache[chatId]) statesCache[chatId] = {};
    const current = statesCache[chatId].youtubeConfig || {};
    const next = { ...current };

    if (patch.buffer_api_key !== undefined) next.buffer_api_key = patch.buffer_api_key || null;
    if (patch.buffer_channel_id !== undefined) next.buffer_channel_id = String(patch.buffer_channel_id || '').trim() || null;
    if (patch.is_active !== undefined) next.is_active = !!patch.is_active;
    if (patch.auto_publish !== undefined) next.auto_publish = !!patch.auto_publish;
    if (patch.schedule_time !== undefined) next.schedule_time = patch.schedule_time || null;
    if (patch.schedule_tz !== undefined) next.schedule_tz = patch.schedule_tz || null;
    if (patch.daily_limit !== undefined) next.daily_limit = parseInt(patch.daily_limit, 10) || 1;
    if (patch.publish_interval_hours !== undefined) next.publish_interval_hours = parseInt(patch.publish_interval_hours, 10) || 24;
    if (patch.allowed_weekdays !== undefined && Array.isArray(patch.allowed_weekdays)) next.allowed_weekdays = patch.allowed_weekdays;
    if (patch.moderator_user_id !== undefined) next.moderator_user_id = String(patch.moderator_user_id || '').trim() || null;
    if (patch.random_publish !== undefined) next.random_publish = !!patch.random_publish;
    if (patch.stats !== undefined) next.stats = { ...(next.stats || {}), ...patch.stats };

    statesCache[chatId].youtubeConfig = next;
    return persist(chatId);
}

function clearYoutubeConfig(chatId) {
    if (statesCache[chatId]) {
        delete statesCache[chatId].youtubeConfig;
        return persist(chatId);
    }
}
```

### Добавить в module.exports

```javascript
getYoutubeConfig, setYoutubeConfig, clearYoutubeConfig,
```

---

## ФАЗА 3: Расширение buffer.service.js

### Контекст

`services/buffer.service.js` (212 строк) уже содержит:
- `createPost(apiKey, channelId, { text, imageUrl, boardServiceId })` — для Pinterest
- `testConnection(apiKey, channelId)` — универсальный тест
- `getPinterestBoards(apiKey, channelId)` — Pinterest-специфика

### Что добавить

Функция `testConnection` уже универсальна — возвращает `service` поле,
YouTube-каналы вернут `service: 'youtube'`. Дополнительная обёртка не нужна.

Функция `createPost` принимает `imageUrl` → `assets.images`. Для YouTube нужен
видео-ассет. Варианты:

**Вариант А** (рекомендуется): Расширить `createPost`, добавив опциональные `videoUrl` и `thumbnailUrl`:

```javascript
async function createPost(apiKey, channelId, { text, imageUrl, videoUrl, thumbnailUrl, boardServiceId }) {
  // ... (существующий код мутации и headers) ...

  const input = {
    channelId,
    text,
    schedulingType: 'automatic',
    mode: 'shareNow',
    assets: {}
  };

  // Видео-ассет (YouTube)
  if (videoUrl) {
    input.assets.video = { url: videoUrl };
    if (thumbnailUrl) {
      input.assets.thumbnail = { url: thumbnailUrl };
    }
  }
  // Изображения (Pinterest, Instagram)
  else if (imageUrl) {
    input.assets.images = [{ url: imageUrl }];
  }

  if (boardServiceId) {
    input.metadata = { pinterest: { boardServiceId } };
  }

  // ... (остальной код без изменений) ...
}
```

**Вариант Б**: Создать отдельную функцию `createYoutubePost`. Менее предпочтителен —
дублирование GraphQL-мутации и обработки ошибок.

### Экспорт

Остаётся прежним — `{ createPost, testConnection, getPinterestBoards }`.

> **Важно:** Формат видео-ассета (`assets.video.url` vs `assets.videos[0].url`)
> нужно верифицировать в Фазе 0. Если Buffer использует другой формат — адаптировать.

---

## ФАЗА 4: MVP-сервис youtubeMvp.service.js

### Файл для создания: `services/youtubeMvp.service.js`

Шаблон: `services/pinterestMvp.service.js` (912 строк).

### Структура модуля

```javascript
const config = require('../config');
const manageStore = require('../manage/store');
const sessionService = require('./session.service');
const dockerService = require('./docker.service');
const storageService = require('./storage.service');
const imageService = require('./image.service');
const aiRouterService = require('./ai_router_service');
const bufferService = require('./buffer.service');
const youtubeRepo = require('./content/youtube.repository');
const contentModules = require('./content');

const SCHEDULE_TZ = config.CONTENT_MVP_TZ || 'Europe/Moscow';
const MAX_THUMBNAIL_ATTEMPTS = 3;
const MAX_REJECT_ATTEMPTS = 3;
const DAILY_YT_LIMIT = parseInt(process.env.YOUTUBE_DAILY_LIMIT || '5', 10);

let cwBot = null;
let schedulerHandle = null;
```

### Ключевые функции

| Функция | Описание | Референс в pinterestMvp |
|---------|----------|-------------------------|
| `getYoutubeSettings(chatId)` | Читает `manageStore.getYoutubeConfig(chatId)`, возвращает настройки | `getPinterestSettings` |
| `generateYoutubeContent(chatId, topic, materials, persona)` | AI генерирует: `videoTitle` (50–60 симв.), `videoDescription` (200–300 симв.), `tags` (5–10 шт.), `thumbnailPrompt` | `generatePinText` |
| `generateThumbnail(chatId, prompt, jobId)` | Генерация превью через `imageService` / KIE API. Формат 16:9 (1280×720) | `generatePinImage` (2:3) |
| `handleYoutubeGenerateJob(chatId, bot, params)` | Полный цикл генерации: выбор темы → AI текст → thumbnail → сохранение job | `handlePinterestGenerateJob` |
| `sendYtToModerator(chatId, bot, draft)` | Отправка на модерацию в CW Bot. Callback: `yt_mod:{jobId}:{action}` | `sendPinToModerator` |
| `handleYtModerationAction(chatId, bot, jobId, action)` | Обработка кнопок: approve → publish, reject → regen, regen_text, regen_image | `handlePinModerationAction` |
| `publishYoutubePost(chatId, bot, jobId, correlationId)` | Публикация через Buffer: копирование видео/thumbnail на хост → публичные URL → `bufferService.createPost()` → лог | `publishPin` |
| `tickYoutubeSchedule(chatId, bot)` | Проверка расписания, постановка job в очередь | `tickPinterestSchedule` |
| `startScheduler(getBots)` | Регистрация job handlers, запуск worker, `setInterval` 60 сек | `startScheduler` |
| `stopScheduler()` | `clearInterval`, остановка worker | `stopScheduler` |
| `runNow(chatId, bot, reason)` | Немедленная генерация + публикация | `runNow` |

### Публикация — ключевой блок

```javascript
async function publishYoutubePost(chatId, bot, jobId, correlationId) {
  const cfg = manageStore.getYoutubeConfig(chatId);
  if (!cfg?.buffer_api_key || !cfg?.buffer_channel_id) {
    throw new Error('YouTube Buffer API key или channel_id не настроены');
  }

  const job = await youtubeRepo.getJobById(chatId, jobId);
  if (!job) throw new Error(`YouTube job ${jobId} not found`);

  // 1. Копируем thumbnail из контейнера на хост
  const session = await sessionService.getOrCreateSession(chatId);
  const dataDir = storageService.getDataDir(chatId);
  const thumbnailFilename = `yt_thumb_${jobId}.png`;
  const thumbnailHostPath = path.join(dataDir, 'output', 'content', thumbnailFilename);

  if (job.thumbnail_path) {
    const tempPath = path.join(os.tmpdir(), `yt-thumb-${chatId}-${jobId}.png`);
    await dockerService.copyFromContainer(session.containerId, job.thumbnail_path, tempPath);
    await fs.copyFile(tempPath, thumbnailHostPath);
    await fs.unlink(tempPath).catch(() => {});
  }

  // 2. Публичные URL
  const thumbnailUrl = job.thumbnail_path
    ? `${config.APP_URL}/api/files/public/${chatId}/${thumbnailFilename}`
    : null;

  // videoUrl — публичный URL видеофайла (загруженного пользователем или сгенерированного)
  const videoUrl = job.video_url;
  if (!videoUrl) throw new Error('video_url не задан для YouTube job');

  // 3. Формируем текст
  const text = [job.video_title, '', job.video_description].filter(Boolean).join('\n');
  if (job.tags) {
    const tagsStr = JSON.parse(job.tags).map(t => `#${t}`).join(' ');
    text += '\n\n' + tagsStr;
  }

  // 4. Публикуем через Buffer
  const result = await bufferService.createPost(cfg.buffer_api_key, cfg.buffer_channel_id, {
    text,
    videoUrl,
    thumbnailUrl
  });

  console.log(`[YOUTUBE-MVP] Published via Buffer, postId=${result.postId}`);

  // 5. Логируем
  await youtubeRepo.addPublishLog(chatId, {
    jobId,
    bufferPostId: result.postId,
    status: 'published',
    correlationId
  });

  // 6. Обновляем job
  await youtubeRepo.updateJob(chatId, jobId, { status: 'published' });

  // 7. Обновляем статистику
  const stats = cfg.stats || {};
  const today = new Date().toISOString().slice(0, 10);
  stats.total_posts = (stats.total_posts || 0) + 1;
  stats.posts_today = (stats.last_post_date === today) ? (stats.posts_today || 0) + 1 : 1;
  stats.last_post_date = today;
  manageStore.setYoutubeConfig(chatId, { stats });

  // 8. Уведомление в Telegram
  if (bot && cfg.moderator_user_id) {
    await bot.telegram.sendMessage(cfg.moderator_user_id,
      `✅ YouTube пост опубликован!\n📹 ${job.video_title}`
    ).catch(() => {});
  }
}
```

### Модерация — кнопки

```javascript
// Inline keyboard для модерации
const keyboard = Markup.inlineKeyboard([
  [Markup.button.callback('✅ Опубликовать', `yt_mod:${jobId}:approve`)],
  [
    Markup.button.callback('🔁 Переделать текст', `yt_mod:${jobId}:regen_text`),
    Markup.button.callback('🖼 Переделать превью', `yt_mod:${jobId}:regen_image`)
  ],
  [Markup.button.callback('❌ Отклонить', `yt_mod:${jobId}:reject`)]
]);
```

### Хранение черновиков

Аналогично Pinterest — в `statesCache[chatId].youtubeDrafts`:

```javascript
function setDraft(chatId, draftId, draft) {
  if (!statesCache[chatId]) statesCache[chatId] = {};
  if (!statesCache[chatId].youtubeDrafts) statesCache[chatId].youtubeDrafts = {};
  statesCache[chatId].youtubeDrafts[draftId] = draft;
  manageStore.persist(chatId);
}
```

### Экспорт

```javascript
module.exports = {
  startScheduler,
  stopScheduler,
  runNow,
  handleYoutubeGenerateJob,
  publishYoutubePost,
  sendYtToModerator,
  handleYtModerationAction,
  tickYoutubeSchedule,
  getYoutubeSettings,
  listJobs,
  getJobById,
  setYtCwBot,
  getYtCwBot
};
```

---

## ФАЗА 5: API-роуты в manage/routes.js

### Контекст

Все каналы: `manage/routes.js`. Pinterest: строки 509-715. Instagram: строки 725-805.

### Добавить после последнего блока каналов

**GET /api/manage/channels/youtube** — чтение конфига:

```javascript
router.get('/channels/youtube', async (req, res) => {
  try {
    const chatId = req.query.chat_id;
    if (!chatId) return res.status(400).json({ error: 'chat_id required' });

    const cfg = manageStore.getYoutubeConfig(chatId);
    if (!cfg) return res.json({ connected: false });

    // Маскируем API key
    const masked = { ...cfg };
    if (masked.buffer_api_key) {
      masked.buffer_api_key = masked.buffer_api_key.substring(0, 6) + '***';
    }
    res.json({ connected: true, config: masked });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**POST /api/manage/channels/youtube** — сохранение конфига:

```javascript
router.post('/channels/youtube', async (req, res) => {
  try {
    const {
      chat_id: chatId, buffer_api_key, buffer_channel_id,
      is_active, auto_publish, schedule_time, schedule_tz,
      daily_limit, publish_interval_hours, allowed_weekdays,
      moderator_user_id, random_publish
    } = req.body;

    if (!chatId) return res.status(400).json({ error: 'chat_id required' });

    const patch = {};
    if (buffer_api_key !== undefined) patch.buffer_api_key = buffer_api_key;
    if (buffer_channel_id !== undefined) patch.buffer_channel_id = buffer_channel_id;
    if (is_active !== undefined) patch.is_active = is_active;
    if (auto_publish !== undefined) patch.auto_publish = auto_publish;
    if (schedule_time !== undefined) patch.schedule_time = schedule_time;
    if (schedule_tz !== undefined) patch.schedule_tz = schedule_tz;
    if (daily_limit !== undefined) patch.daily_limit = daily_limit;
    if (publish_interval_hours !== undefined) patch.publish_interval_hours = publish_interval_hours;
    if (allowed_weekdays !== undefined) patch.allowed_weekdays = allowed_weekdays;
    if (moderator_user_id !== undefined) patch.moderator_user_id = moderator_user_id;
    if (random_publish !== undefined) patch.random_publish = random_publish;

    manageStore.setYoutubeConfig(chatId, patch);

    // Инициализация YouTube-схемы в БД пользователя
    const { ensureChannelSchema } = require('../services/content/repository');
    await ensureChannelSchema(chatId, 'youtube');

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**DELETE /api/manage/channels/youtube** — удаление конфига:

```javascript
router.delete('/channels/youtube', async (req, res) => {
  try {
    const chatId = req.query.chat_id;
    if (!chatId) return res.status(400).json({ error: 'chat_id required' });
    manageStore.clearYoutubeConfig(chatId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**POST /api/manage/channels/youtube/test-buffer** — тест соединения:

```javascript
router.post('/channels/youtube/test-buffer', async (req, res) => {
  try {
    const { buffer_api_key, buffer_channel_id } = req.body;
    const result = await bufferService.testConnection(buffer_api_key, buffer_channel_id);
    if (result.service !== 'youtube') {
      return res.status(400).json({ ok: false, error: `Канал является ${result.service}, а не YouTube` });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
```

**GET /api/manage/channels/youtube/jobs** — список заданий:

```javascript
router.get('/channels/youtube/jobs', async (req, res) => {
  try {
    const { chat_id: chatId, limit = 20, offset = 0 } = req.query;
    if (!chatId) return res.status(400).json({ error: 'chat_id required' });
    const youtubeRepo = require('../services/content/youtube.repository');
    const jobs = await youtubeRepo.listJobs(chatId, { limit, offset });
    res.json(jobs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

---

## ФАЗА 6: Планировщик и модерация в server.js

### Контекст

`server.js` регистрирует каждый MVP-сервис одинаково:
1. Импорт сервиса
2. Установка CW Bot
3. Запуск планировщика
4. Обработчик модерации в CW Bot

Референс: строки 467-508 (Pinterest), строки 367-408 (Pinterest moderation).

### 6.1. Импорт и cwBot (после аналогичных строк для Pinterest/Instagram)

```javascript
const youtubeMvpService = require('./services/youtubeMvp.service');
```

### 6.2. Установка cwBot (в блоке `if (cwBot)`)

```javascript
youtubeMvpService.setYtCwBot(cwBot);
```

### 6.3. Запуск планировщика (после `instagramMvpService.startScheduler(...)`)

```javascript
youtubeMvpService.startScheduler(() => telegramRunner.bots);
```

### 6.4. CW Bot — обработчик модерации

```javascript
cwBot.action(/^yt_mod:(\d+):(approve|reject|regen_text|regen_image)$/, async (ctx) => {
  try {
    const jobId = parseInt(ctx.match[1], 10);
    const action = ctx.match[2];

    // Найти chatId по jobId в черновиках
    let targetChatId = null;
    for (const [chatId, state] of Object.entries(manageStore.getAllStates())) {
      if (state.youtubeDrafts && state.youtubeDrafts[jobId]) {
        targetChatId = chatId;
        break;
      }
    }

    if (!targetChatId) {
      return ctx.answerCbQuery('Черновик не найден или устарел');
    }

    await youtubeMvpService.handleYtModerationAction(targetChatId, cwBot, jobId, action);
    await ctx.answerCbQuery(`YouTube: ${action}`);
  } catch (e) {
    console.error('[YT-MODERATION]', e.message);
    await ctx.answerCbQuery('Ошибка обработки').catch(() => {});
  }
});
```

### 6.5. Остановка при shutdown (в блоке graceful shutdown)

```javascript
youtubeMvpService.stopScheduler();
```

---

## ФАЗА 7: Schema stub в repository.js

### Контекст

`services/content/repository.js` строка ~1295 содержит stub:
```javascript
} else if (channelName === 'youtube') {
  // Stub: таблицы ещё не определены
}
```

### Заменить на

```javascript
} else if (channelName === 'youtube') {
  const youtubeRepo = require('./youtube.repository');
  await youtubeRepo.ensureSchema(chatId);
}
```

---

## ФАЗА 8: AI-контекст — context.js + prompts.js

### 8.1. manage/context.js

Добавить функцию определения активности YouTube-канала (рядом с аналогичными):

```javascript
function isYoutubeChannelActive(chatId) {
  const cfg = manageStore.getYoutubeConfig(chatId);
  return !!(cfg && cfg.is_active && cfg.buffer_api_key && cfg.buffer_channel_id);
}
```

В функции `buildFullContextStructured` добавить в массив `enabledChannels`:

```javascript
if (isYoutubeChannelActive(chatId)) enabledChannels.push('youtube');
```

### 8.2. manage/prompts.js

YouTube copywriter instructions уже существуют (строки 417-424) но минимальны.
Расширить:

```
▶️ Навык "Копирайтер для YouTube":
  • Структура: название видео + описание + теги + описание превью
  • Название (title): 50–60 символов, с ключевыми словами в начале
  • Описание (description): 200–500 символов, первые 2 строки — самые важные (видны без раскрытия)
  • Призыв к подписке и лайку в конце описания
  • Теги: 5–10 релевантных, через запятую
  • Превью (thumbnail): яркое, контрастное, текст крупным шрифтом, лицо/эмоция
  • Для Shorts: описание до 100 символов, 3–5 хэштегов, обязательно #Shorts
  • SEO: ключевое слово в title + description + тегах
```

---

## ФАЗА 9: Frontend — channels.html + channels.js

### 9.1. public/channels.html

Заменить блок "Coming soon" (строки 625-632) на форму настройки YouTube.
Шаблон: форма Pinterest в том же файле.

Поля формы:
- **Buffer API Key** (`<input type="password">`) — с кнопкой "показать/скрыть"
- **Buffer Channel ID** (`<input type="text">`)
- **Кнопка "🔗 Проверить соединение"** → `POST /api/manage/channels/youtube/test-buffer`
- **Активен** (`<input type="checkbox">`)
- **Автопубликация** (`<input type="checkbox">`) — если выкл → модерация через CW Bot
- **Время публикации** (`<input type="time">`)
- **Часовой пояс** (`<select>`)
- **Дневной лимит** (`<input type="number">`)
- **Интервал между публикациями (часы)** (`<input type="number">`)
- **Дни недели** (чекбоксы Пн–Вс)
- **ID модератора** (`<input type="text">`)
- **Кнопка "💾 Сохранить"** → `POST /api/manage/channels/youtube`
- **Кнопка "🗑️ Отключить"** → `DELETE /api/manage/channels/youtube`

### 9.2. public/js/channels.js

YouTube уже зарегистрирован в `ALL_CHANNELS` (строка 29). Добавить обработчики:

```javascript
async function loadYoutubeConfig(chatId) { /* GET /api/manage/channels/youtube */ }
async function saveYoutubeConfig(chatId) { /* POST /api/manage/channels/youtube */ }
async function deleteYoutubeConfig(chatId) { /* DELETE /api/manage/channels/youtube */ }
async function testYoutubeBuffer() { /* POST /api/manage/channels/youtube/test-buffer */ }
```

Также убрать `style="display: none;"` с YouTube-таба в `channels.html`.

---

## ФАЗА 10: Интеграционное тестирование

### 10.1. Синтаксис

```bash
node --check services/content/youtube.repository.js
node --check services/youtubeMvp.service.js
node --check services/buffer.service.js
node --check manage/store.js
node --check manage/routes.js
node --check manage/context.js
node --check server.js
```

### 10.2. Юнит-тесты

Создать `tests/youtube.mvp.test.js` по шаблону `tests/vk.publisher.test.js`:
- Тест `getYoutubeSettings()` — возвращает конфиг
- Тест `countPublishedToday()` — лимиты
- Тест расписания — слоты, дни недели

### 10.3. API тесты

```bash
# Тест конфига
curl -X POST http://localhost:3015/api/manage/channels/youtube \
  -H "Content-Type: application/json" \
  -d '{ "chat_id": "TEST_CHAT_ID", "buffer_api_key": "test_key", "buffer_channel_id": "test_channel", "is_active": true }'

# Чтение (ключ замаскирован)
curl "http://localhost:3015/api/manage/channels/youtube?chat_id=TEST_CHAT_ID"

# Тест соединения (с реальными ключами)
curl -X POST http://localhost:3015/api/manage/channels/youtube/test-buffer \
  -H "Content-Type: application/json" \
  -d '{ "buffer_api_key": "REAL_KEY", "buffer_channel_id": "REAL_CHANNEL_ID" }'

# Удаление
curl -X DELETE "http://localhost:3015/api/manage/channels/youtube?chat_id=TEST_CHAT_ID"
```

### 10.4. E2E проверка

1. Настроить YouTube канал в Buffer
2. Ввести credentials в UI `/channels.html`
3. Нажать "Проверить соединение" → ожидать `{ ok: true, service: 'youtube' }`
4. Сохранить настройки
5. Запустить генерацию вручную или дождаться тика планировщика
6. Проверить модерацию в CW Bot (если auto_publish выключен)
7. Подтвердить публикацию → проверить что пост появился в Buffer queue / на YouTube

---

## Критические файлы

| Файл | Действие | Строк (оценка) |
|------|----------|----------------|
| `services/content/youtube.repository.js` | **Новый** | ~300 |
| `services/youtubeMvp.service.js` | **Новый** | ~900 |
| `services/buffer.service.js` | Расширить `createPost` | +15 |
| `manage/store.js` | Добавить YouTube getter/setter/clear | +40 |
| `manage/routes.js` | Добавить YouTube endpoints | +100 |
| `server.js` | Scheduler + moderation handler | +40 |
| `services/content/repository.js` | Заменить stub | +3 |
| `manage/context.js` | `isYoutubeChannelActive` | +10 |
| `manage/prompts.js` | Расширить YouTube instructions | +10 |
| `public/channels.html` | Форма настройки YouTube | +80 |
| `public/js/channels.js` | YouTube обработчики | +60 |
| `tests/youtube.mvp.test.js` | **Новый** | ~100 |

**Итого:** ~1660 строк нового/изменённого кода, 12 файлов.

---

## Переменные окружения

| Переменная | Значение по умолчанию | Описание |
|-----------|----------------------|----------|
| `YOUTUBE_DAILY_LIMIT` | `5` | Макс. публикаций в YouTube в день |

Credentials Buffer (`buffer_api_key`, `buffer_channel_id`) вводятся пользователем
через UI и хранятся в `manage/store.js`, **не** в `.env`.

---

## Что НЕ нужно делать (ошибки исходного ТЗ)

| Исходное ТЗ предлагало | Почему не нужно |
|------------------------|-----------------|
| OAuth 2.0 Authorization Code Grant | Buffer использует статический API-ключ, без OAuth flow |
| `/api/auth/buffer/authorize` и `/callback` роуты | Credentials вводятся в UI, не через OAuth redirect |
| Таблицы `buffer_credentials`, `buffer_auth_log` в PostgreSQL | Credentials хранятся в `manage/store.js` (файлы) |
| `refresh_token` и автообновление | Статический Bearer токен, не истекает |
| Class-based `BufferService` | Проект использует функциональный стиль |
| `axios` | Проект использует `node-fetch` |
| Модификация `contentMvp.service.js` | Каждый канал — отдельный MVP-сервис |
| Роуты в `routes/auth.routes.js` | Каналы настраиваются через `manage/routes.js` |
| `postgresService.getBufferCredentials()` | Credentials из `manageStore.getYoutubeConfig()` |
| `viewer { organization { channels } }` запрос | Реально: `channel(input: { id })` |
| Union types `MutationError` / `ValidationError` | Реально: `UnexpectedError`, `InvalidInputError`, `UnauthorizedError` и др. |
