Архитектура отдельного видео-пайплайна                                           │
  │                                                                                     │
  │    Концепция                                                                        │
  │                                                                                     │
  │    Первый канал (YouTube/TikTok/Instagram) по своему расписанию или вручную         │
  │    инициирует генерацию видео. Генерируется одно вертикальное видео 9:16 —          │
  │    "чистое", без текста/тегов. Остальные каналы переиспользуют это же видео,        │
  │    добавляя свои тексты/теги/описания согласно специфике платформы.                 │
  │                                                                                     │
  │    Порядок работы                                                                   │
  │                                                                                     │
  │     1. YouTube (или другой канал) по расписанию решает: "нужно видео"               │
  │     2. Запускает videoPipeline.generate() → создается видео                         │
  │     3. Видео сохраняется во временную папку /var/sandbox-data/.video-temp/          │
  │     4. YouTube забирает видео, публикует, ставит метку youtube_used                 │
  │     5. Instagram по своему расписанию: находит свободное видео → забирает → ставит  │
  │        метку instagram_used                                                         │
  │     6. TikTok аналогично → ставит метку tiktok_used                                 │
  │     7. Когда все 3 метки получены → таймер 60 мин → удаление                        │
  │     8. Если видео удалено, а каналу нужно → новый канал инициирует новую генерацию  │
  │                                                                                     │
  │    ---                                                                              │
  │                                                                                     │
  │    Файлы для создания                                                               │
  │                                                                                     │
  │    1. Миграция БД                                                                   │
  │    `migrations/20260410_add_video_pipeline.sql`                                     │
  │                                                                                     │
  │      1 -- Таблица интерьеров                                                        │
  │      2 CREATE TABLE IF NOT EXISTS interiors (                                       │
  │      3   id BIGSERIAL PRIMARY KEY,                                                  │
  │      4   chat_id TEXT NOT NULL,                                                     │
  │      5   description TEXT NOT NULL,        -- описание интерьера для промпта        │
  │      6   style VARCHAR(100),               -- стиль: modern, minimalist, loft...    │
  │      7   created_at TIMESTAMPTZ DEFAULT NOW()                                       │
  │      8 );                                                                           │
  │      9                                                                              │
  │     10 -- Таблица видео-ассетов                                                     │
  │     11 CREATE TABLE IF NOT EXISTS video_assets (                                    │
  │     12   id BIGSERIAL PRIMARY KEY,                                                  │
  │     13   chat_id TEXT NOT NULL,                                                     │
  │     14   product_image_path TEXT NOT NULL,  -- путь к изображению товара            │
  │     15   interior_id BIGINT REFERENCES interiors(id),                               │
  │     16   scene_image_path TEXT,             -- путь к сгенерированной сцене         │
  │     17   video_path TEXT,                   -- путь к видео (временная папка)       │
  │     18   status TEXT NOT NULL DEFAULT 'pending',  -- pending, scene_generating,     │
  │        scene_ready, video_generating, video_ready, published, expired               │
  │     19   provider TEXT DEFAULT 'kie-veo3.1',                                        │
  │     20   video_duration INT,                -- длительность в секундах              │
  │     21   file_size BIGINT,                                                          │
  │     22   correlation_id TEXT,                                                       │
  │     23   all_channels_marked_at TIMESTAMPTZ,  -- когда получены все метки           │
  │     24   scheduled_deletion_at TIMESTAMPTZ,     -- когда удалить                    │
  │        (all_channels_marked_at + 60 min)                                            │
  │     25   created_at TIMESTAMPTZ DEFAULT NOW(),                                      │
  │     26   updated_at TIMESTAMPTZ DEFAULT NOW()                                       │
  │     27 );                                                                           │
  │     28                                                                              │
  │     29 -- Метки использования каналами                                              │
  │     30 CREATE TABLE IF NOT EXISTS video_channel_usage (                             │
  │     31   id BIGSERIAL PRIMARY KEY,                                                  │
  │     32   video_id BIGINT REFERENCES video_assets(id) ON DELETE CASCADE,             │
  │     33   channel_type TEXT NOT NULL,       -- youtube, tiktok, instagram            │
  │     34   used_at TIMESTAMPTZ DEFAULT NOW(),                                         │
  │     35   UNIQUE(video_id, channel_type)                                             │
  │     36 );                                                                           │
  │     37                                                                              │
  │     38 -- Индексы                                                                   │
  │     39 CREATE INDEX idx_video_assets_chat_status ON video_assets(chat_id, status);  │
  │     40 CREATE INDEX idx_video_assets_deletion ON                                    │
  │        video_assets(scheduled_deletion_at) WHERE scheduled_deletion_at IS NOT NULL; │
  │     41 CREATE INDEX idx_interiors_chat ON interiors(chat_id);                       │
  │                                                                                     │
  │    2. Репозиторий                                                                   │
  │    `services/content/videoPipeline.repository.js`                                   │
  │                                                                                     │
  │    Функции:                                                                         │
  │     - ensureSchema(chatId) — создание таблиц                                        │
  │     - Interiors: addInterior(), getInteriors(), getRandomInterior(),                │
  │       deleteInterior()                                                              │
  │     - Video Assets: createAsset(), getById(), updateStatus(),                       │
  │       getAvailableForChannel(), markForDeletion()                                   │
  │     - Channel Usage: markUsed(), getUsageMarks(), areAllChannelsUsed(),             │
  │       clearDeletionSchedule()                                                       │
  │     - Cleanup: getExpiredVideos(), deleteAsset()                                    │
  │                                                                                     │
  │    3. Сервис                                                                        │
  │    `services/videoPipeline.service.js`                                              │
  │                                                                                     │
  │    Основные функции:                                                                │
  │                                                                                     │
  │      1 // === ГЕНЕРАЦИЯ ===                                                         │
  │      2 async function generateVideo(chatId, initiatingChannel) {                    │
  │      3   // 1. Получить случайное изображение из /workspace/input                   │
  │      4   // 2. Получить случайный интерьер из БД                                    │
  │      5   // 3. Сгенерировать сцену (KIE.ai image-to-image)                          │
  │      6   // 4. Сгенерировать видео (KIE.ai Veo 3.1 image-to-video)                  │
  │      7   // 5. Сохранить во временную папку                                         │
  │      8   // 6. Поставить метку initiatingChannel                                    │
  │      9 }                                                                            │
  │     10                                                                              │
  │     11 // === ПОЛУЧЕНИЕ ВИДЕО КАНАЛОМ ===                                           │
  │     12 async function claimVideo(chatId, channelType) {                             │
  │     13   // Найти видео без метки этого канала → вернуть путь + пометить            │
  │     14 }                                                                            │
  │     15                                                                              │
  │     16 // === ПЛАНИРОВЩИК УДАЛЕНИЯ ===                                              │
  │     17 async function scheduleCleanup(videoId) {                                    │
  │     18   // Когда все 3 метки → scheduledDeletionAt = NOW() + 60min                 │
  │     19 }                                                                            │
  │     20                                                                              │
  │     21 // === ОЧИСТКА ===                                                           │
  │     22 async function cleanupExpiredVideos() {                                      │
  │     23   // Удалить видео где scheduledDeletionAt < NOW()                           │
  │     24 }                                                                            │
  │     25                                                                              │
  │     26 // === УТИЛИТЫ ===                                                           │
  │     27 function getInputImages(chatId)     // Список файлов из /workspace/input     │
  │     28 function getAvailableVideo(chatId, channelType)  // Для канала               │
  │                                                                                     │
  │    4. Интеграция с KIE.ai                                                           │
  │                                                                                     │
  │    Генерация сцены (image-to-image):                                                │
  │     1 // KIE.ai API: товар + описание интерьера → сцена                             │
  │     2 POST /api/v1/image/generate                                                   │
  │     3 {                                                                             │
  │     4   prompt: "Product in modern minimalist interior, professional photography",  │
  │     5   imageUrls: ["file://path/to/product-image.jpg"],                            │
  │     6   model: "kie-image-v1"                                                       │
  │     7 }                                                                             │
  │                                                                                     │
  │    Генерация видео (image-to-video, Veo 3.1):                                       │
  │     1 // KIE.ai API: сцена → видео                                                  │
  │     2 POST /api/v1/veo/generate                                                     │
  │     3 {                                                                             │
  │     4   prompt: "Smooth cinematic pan, product showcase...",                        │
  │     5   imageUrls: ["file://path/to/scene-image.jpg"],                              │
  │     6   model: "veo3.1",                                                            │
  │     7   aspectRatio: "9:16",                                                        │
  │     8   generationType: "IMAGE_2_VIDEO"  // вместо TEXT_2_VIDEO                     │
  │     9 }                                                                             │
  │                                                                                     │
  │    5. API Routes                                                                    │
  │    `routes/video.routes.js`                                                         │
  │                                                                                     │
  │     1 POST   /api/video/generate              — запустить генерацию (канал или      │
  │       вручную)                                                                      │
  │     2 GET    /api/video/assets                 — список видео                       │
  │     3 GET    /api/video/assets/:id             — конкретное видео                   │
  │     4 POST   /api/video/claim                  — канал забирает видео               │
  │     5 POST   /api/video/interiors              — добавить интерьер                  │
  │     6 GET    /api/video/interiors              — список интерьеров                  │
  │     7 DELETE /api/video/interiors/:id          — удалить интерьер                   │
  │     8 GET    /api/video/stats                  — статистика                         │
  │                                                                                     │
  │    6. UI                                                                            │
  │    `public/video.html` — страница управления видео                                  │
  │     - Загрузка изображений товаров                                                  │
  │     - CRUD интерьеров                                                               │
  │     - Список сгенерированных видео с превью                                         │
  │     - Статус меток каналов (YouTube ✓, Instagram ✗, TikTok ✗)                       │
  │     - Таймер обратного отсчёта до удаления                                          │
  │                                                                                     │
  │    `public/js/video.js` — фронтенд логика                                           │
  │                                                                                     │
  │    7. Интеграция                                                                    │
  │                                                                                     │
  │    server.js:                                                                       │
  │     1 const videoPipeline = require('./services/videoPipeline.service');            │
  │     2 const videoRoutes = require('./routes/video.routes');                         │
  │     3 app.use('/api/video', videoRoutes);                                           │
  │     4                                                                               │
  │     5 // Планировщик очистки                                                        │
  │     6 setInterval(() => videoPipeline.cleanupExpiredVideos(), 5 * 60 * 1000);       │
  │                                                                                     │
  │    YouTube/Instagram/TikTok сервисы:                                                │
  │     1 // Вместо generateVideo() → claimVideo()                                      │
  │     2 const video = await videoPipeline.claimVideo(chatId, 'youtube');              │
  │     3 // ... публикация с добавлением текста/тегов                                  │
  │     4 await videoPipeline.markUsed(video.id, 'youtube');                            │
  │                                                                                     │
  │    ---                                                                              │
  │                                                                                     │
  │    Обновления существующих файлов                                                   │
  │                                                                                     │
  │                                                                                     │
  │    ┌──────────────────────────────────┬───────────────────────────────────────────┐ │
  │    │ Файл                             │ Изменение                                 │ │
  │    ├──────────────────────────────────┼───────────────────────────────────────────┤ │
  │    │ server.js                        │ Подключить videoRoutes, cleanup scheduler │ │
  │    │ services/content/index.js        │ Экспортировать videoPipelineRepo          │ │
  │    │ services/youtubeMvp.service.js   │ Заменить generateVideo на claimVideo      │ │
  │    │ public/js/channels.js            │ Кнопка "Сгенерировать видео"              │ │
  │    │ QWEN.md                          │ Документация                              │ │
  │    └──────────────────────────────────┴───────────────────────────────────────────┘ │
  │                                                                                     │
  │    Примечание: services/instagramMvp.service.js — НЕ входит в scope видео-пайплайна. │
  │    Текущий Instagram MVP публикует статические изображения 1:1 через Buffer API.    │
  │    Instagram Reels (вертикальное видео 9:16) — отдельный будущий функционал,        │
  │    который потребует отдельного сервиса (instagramReelsMvp.service.js или           │
  │    аналогичного). Видео-пайплайн предназначен для: YouTube Shorts, TikTok,         │
  │    Instagram Reels (когда будет реализован).                                        │
  │                                                                                     │
  │    ---                                                                              │
  │                                                                                     │
  │    Итого: 6 новых файлов, ~5 обновлений                                             │
  │                                                                                     │
  │    Новые:                                                                           │
  │     1. migrations/20260410_add_video_pipeline.sql                                   │
  │     2. services/content/videoPipeline.repository.js                                 │
  │     3. services/videoPipeline.service.js                                            │
  │     4. routes/video.routes.js                                                       │
  │     5. public/video.html                                                            │
  │     6. public/js/video.js                                                           │
  │                                                                                     │
  │    Обновления:                                                                      │
  │     1. server.js                                                                    │
  │     2. services/content/index.js                                                    │
  │     3. services/youtubeMvp.service.js                                               │
  │     4. public/channels.html (кнопки управления)                                     │
  │                                                                                     │
  └─────────────────────────────────────────────────────────────────────────────────────┘

---

## Анализ текущего состояния (10.04.2026)

### Что уже реализовано

| Файл | Статус |
|------|--------|
| `migrations/20260410_add_video_pipeline.sql` | ✅ Создан |
| `services/content/videoPipeline.repository.js` | ✅ Создан |
| `services/videoPipeline.service.js` | ✅ Создан |
| `routes/video.routes.js` | ✅ Создан |
| `public/video.html` | ❌ Отсутствует |
| `public/js/video.js` | ❌ Отсутствует |
| `server.js` (подключение роутов) | ❌ Не обновлён |
| `services/content/index.js` (экспорт) | ❌ Не обновлён |
| `services/youtubeMvp.service.js` (claimVideo) | ❌ Не обновлён |
| `services/instagramMvp.service.js` | — не применимо (статические изображения, не Reels) |
| `public/channels.html` (кнопки) | ❌ Не обновлён |

---

## Рекомендации и дополнения

### 1. Критические баги — исправить до запуска

#### 1.1 Статус `failed` не проставляется при ошибке генерации

В `services/videoPipeline.service.js`, функция `generateVideo()`:
- Запись `video_assets` создаётся на шаге 3
- При ошибке на шагах 4–8 статус остаётся `scene_generating` / `video_generating`
- Блок `catch` содержит комментарий «проще просто залогировать», но это ломает FSM

**Исправление:**
```js
// В generateVideo(), сохранить videoId перед try
let videoId = null;
try {
  const videoAsset = await vpRepo.createVideoAsset(...);
  videoId = videoAsset.id;
  // ... остальная логика
} catch (e) {
  if (videoId) {
    await vpRepo.updateVideoStatus(chatId, videoId, 'failed', { errorText: e.message }).catch(() => {});
  }
  return { success: false, error: e.message, videoId: null, videoPath: null };
}
```

#### 1.2 Отсутствует колонка `error_text` в схеме

`updateVideoStatus()` пытается записать `extra.errorText` → `error_text`, но колонки нет ни в `ensureSchema()`, ни в SQL-миграции. При вызове с `errorText` запрос упадёт.

**Исправление:** добавить в `ensureSchema()` и в миграцию:
```sql
ALTER TABLE video_assets ADD COLUMN IF NOT EXISTS error_text TEXT;
```

#### 1.3 Изображение товара не передаётся в KIE image API

В `generateScene()` читается `imageBuffer` и `base64Image`, но в тело запроса к KIE (`generateImageViaKIE`) передаётся только текстовый промпт — без изображения товара. KIE image-to-image генерация требует URL изображения. Сейчас фактически делается text-to-image.

**Решение:** либо загружать изображение товара на временный публичный endpoint перед вызовом KIE, либо использовать multipart-form upload через KIE `/api/v1/image/upload`, получать resultUrl и передавать в `imageUrls`.

#### 1.4 Публичный URL сцены для KIE Veo API не существует

В `generateVideoFromScene()` (строка 303):
```js
const scenePublicUrl = `${config.APP_URL}/api/files/public/${chatId}/.video-temp/${chatId}/...`;
```
Маршрут `/api/files/public/` нигде не зарегистрирован в `routes/`. KIE Veo API получит 404. Файлы во `.video-temp` недоступны публично.

**Варианты решения:**
- Зарегистрировать статический маршрут для VIDEO_TEMP_ROOT (с проверкой авторизации по chatId)
- Загружать сцену в KIE через их upload endpoint и использовать полученный URL
- Временно раздавать файл через специальный route с токеном-одноразовым ключом

---

### 2. Архитектурные дополнения

#### 2.1 Автоматический fallback: claimVideo → generateVideo

Каналы (YouTube, Instagram) при отсутствии готового видео должны автоматически инициировать генерацию, а не возвращать ошибку. Рекомендуемая логика в сервисах:

```js
// services/youtubeMvp.service.js (пример)
async function getOrGenerateVideo(chatId) {
  const claim = await videoPipeline.claimVideo(chatId, 'youtube');
  if (claim.success) return claim;

  // Нет готового видео — проверяем, идёт ли генерация
  const stats = await videoPipeline.getVideoStats(chatId);
  const inProgress = (stats.scene_generating || 0) + (stats.video_generating || 0);
  if (inProgress > 0) return { success: false, pending: true, error: 'Generation in progress' };

  // Запускаем новую генерацию
  return videoPipeline.generateVideo(chatId, 'youtube');
}
```

#### 2.2 TikTok отсутствует как сервис

`CHANNELS = ['youtube', 'tiktok', 'instagram']` — TikTok включён в логику меток, но `services/tiktokMvp.service.js` не существует. Пока TikTok не реализован, видео никогда не получит все 3 метки → не будет удалено.

**Решение:** либо убрать TikTok из `CHANNELS` до появления сервиса, либо сделать его опциональным (настраиваемый список через env/config):
```js
// В videoPipeline.repository.js
const CHANNELS = (process.env.VIDEO_CHANNELS || 'youtube,instagram').split(',');
```

#### 2.3 `markVideoUsed` в репозитории — сломанная legacy-функция

`videoPipeline.repository.js`, строки 306–313: функция `markVideoUsed` всегда бросает `Error('Use markVideoUsedById...')`. Если какой-то код её вызовет — получит необработанный сброс. Нужно либо удалить, либо правильно реализовать.

#### 2.4 Конкурентная генерация — нет защиты от дублей

Если два канала одновременно обнаруживают отсутствие видео и оба вызывают `generateVideo()`, запустятся две параллельные генерации (дорого, ~10 мин, двойные траты KIE credits).

**Решение:** добавить в БД запись-«резервирование» перед генерацией, либо использовать простой in-memory лок по chatId:
```js
const generatingLocks = new Set(); // chatId

async function generateVideo(chatId, initiatingChannel, correlationId) {
  if (generatingLocks.has(chatId)) {
    return { success: false, error: 'Generation already in progress for this user' };
  }
  generatingLocks.add(chatId);
  try {
    // ... логика
  } finally {
    generatingLocks.delete(chatId);
  }
}
```

---

### 3. Производительность и надёжность

#### 3.1 Cleanup итерирует по всем пользователям — может быть медленным

`cleanupExpiredVideos()` запрашивает `getAllSessions()` + `getAllStates()` и для каждого пользователя делает отдельный DB-коннект. При 100+ пользователях каждые 5 минут это нагрузка.

**Рекомендация:** добавить центральный реестр chatId с активными видео (Set в памяти), который пополняется при `generateVideo()` и очищается после успешного cleanup.

#### 3.2 Таймаут `node-fetch` работает иначе в v2

Параметр `timeout` в `node-fetch` v2 — не HTTP-таймаут, а таймаут ответа (body). При медленном сервере может зависнуть. Для критичных запросов (скачивание видео до 100 MB) рекомендуется использовать `AbortController`:
```js
const AbortController = require('abort-controller');
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 120000);
const resp = await fetch(url, { signal: controller.signal });
clearTimeout(timeout);
```

#### 3.3 Сцена сохраняется дважды

В `generateImageViaKIE()` файл сохраняется с именем `scene_{corrId}_{attempt}.png`, потом `saveSceneToTemp()` сохраняет его ещё раз как `video_{videoId}_scene.png`. При этом первый файл никогда не удаляется. Рекомендуется унифицировать хранение сцены.

---

### 4. Что нужно добавить в `.env` / `config.js`

```env
KIE_API_KEY=               # Обязателен — без него pipeline не работает
KIE_IMAGE_MODEL=kie-image-v1
VIDEO_MODEL=veo3.1
VIDEO_ASPECT_RATIO=9:16
VIDEO_TEMP_ROOT=           # По умолчанию: DATA_ROOT/.video-temp
VIDEO_POLL_INTERVAL_SEC=25
VIDEO_TIMEOUT_SEC=600
VIDEO_CLEANUP_INTERVAL_MS=300000
VIDEO_CHANNELS=youtube,instagram   # TikTok — когда сервис будет готов
```

Добавить `KIE_API_KEY` в документацию обязательных переменных (сейчас отсутствует в `config.js`).

---

### 5. Приоритетный порядок реализации оставшихся задач

1. **[BLOCKER]** Зарегистрировать `videoRoutes` в `server.js` + вызвать `videoPipeline.init()`
2. **[BLOCKER]** Добавить `error_text` в схему (ensureSchema + миграция)
3. **[BLOCKER]** Решить проблему с публичным URL для KIE API (сцена + товар)
4. **[HIGH]** Исправить обработку ошибок в `generateVideo` → статус `failed`
5. **[HIGH]** Убрать TikTok из CHANNELS или сделать его опциональным
6. **[HIGH]** Создать `public/video.html` + `public/js/video.js`
7. **[MEDIUM]** Интегрировать `claimVideo` в `youtubeMvp.service.js`
8. **[FUTURE]** Instagram Reels — отдельный сервис (`instagramReelsMvp.service.js`), интеграция с видео-пайплайном после его реализации
9. **[MEDIUM]** Добавить in-memory лок от дублирования генерации
10. **[LOW]** Экспортировать `videoPipelineRepo` из `services/content/index.js`
11. **[LOW]** Добавить кнопку управления видео в `public/channels.html`

