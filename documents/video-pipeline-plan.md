# Архитектура отдельного видео-пайплайна

**Дата:** 2026-04-10  
**Статус:** ✅ Реализовано

---

## Концепция

**Первый канал** (YouTube/TikTok/Instagram) по своему расписанию или вручную **инициирует генерацию видео**. Генерируется **одно вертикальное видео 9:16** — "чистое", без текста/тегов. **Остальные каналы** переиспользуют это же видео, добавляя свои тексты/теги/описания согласно специфике платформы.

---

## Порядок работы

```
┌─────────────────────────────────────────────────────────────┐
│                   ГЕНЕРАЦИЯ ВИДЕО                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. YouTube (первый канал) по расписанию решает:            │
│     "нужно видео"                                           │
│                                                             │
│  2. Запускает videoPipeline.generate()                      │
│     ↓                                                       │
│     a. Берёт случайное фото товара из /workspace/input      │
│     b. Берёт случайное описание интерьера из БД             │
│     c. KIE.ai: фото товара + интерьер → сцена               │
│     d. KIE.ai Veo 3.1: сцена → видео (image-to-video)       │
│     ↓                                                       │
│  3. Видео сохраняется в /var/sandbox-data/.video-temp/      │
│     ↓                                                       │
│  4. YouTube ставит метку: youtube_used ✓                    │
│                                                             │
│  5. Instagram по своему расписанию:                         │
│     находит свободное видео → забирает → instagram_used ✓   │
│                                                             │
│  6. TikTok по своему расписанию:                            │
│     находит свободное видео → забирает → tiktok_used ✓      │
│                                                             │
│  7. Все 3 метки получены → таймер 60 мин → удаление         │
│                                                             │
│  8. Видео удалено, каналу нужно → новая генерация           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Созданные файлы

### 1. Миграция БД

**`migrations/20260410_add_video_pipeline.sql`**

Три таблицы:

- **`interiors`** — описания интерьеров для генерации сцен
- **`video_assets`** — видео-ассеты со статусами и метками
- **`video_channel_usage`** — метки использования каналами (youtube, tiktok, instagram)

### 2. Репозиторий

**`services/content/videoPipeline.repository.js`**

CRUD операции:
- `ensureSchema(chatId)` — создание таблиц
- `addInterior()`, `getInteriors()`, `getRandomInterior()`, `deleteInterior()`
- `createVideoAsset()`, `getVideoById()`, `updateVideoStatus()`, `listVideos()`
- `getAvailableVideoForChannel()` — SELECT ... FOR UPDATE SKIP LOCKED
- `markVideoUsedById()` — с авто-проверкой полноты меток
- `getExpiredVideosForChat()`, `markVideoExpired()`, `deleteVideoAsset()`

### 3. Сервис

**`services/videoPipeline.service.js`**

Основные функции:
- `init()` — инициализация temp папки + запуск scheduler
- `generateVideo(chatId, initiatingChannel)` — полный цикл генерации
- `claimVideo(chatId, channelType)` — канал забирает видео
- `markVideoUsed(chatId, videoId, channelType)` — ручная метка
- `cleanupExpiredVideos()` — удаление просроченных видео
- `getInputImages()`, `getRandomProductImage()` — работа с /workspace/input
- `addInterior()`, `getInteriors()`, `deleteInterior()` — управление интерьерами

### 4. API Routes

**`routes/video.routes.js`**

```
POST   /api/video/generate              — запустить генерацию
GET    /api/video/assets                 — список видео
GET    /api/video/assets/:id             — конкретное видео + метки
POST   /api/video/claim                  — канал забирает видео
POST   /api/video/assets/:id/use         — поставить метку
GET    /api/video/stats                  — статистика
POST   /api/video/interiors              — добавить интерьер
GET    /api/video/interiors              — список интерьеров
DELETE /api/video/interiors/:id          — удалить интерьер
GET    /api/video/product-images         — изображения товаров
```

### 5. UI

**`public/video.html`** — страница управления видео
**`public/js/video.js`** — фронтенд логика

Функции UI:
- Генерация видео с выбором канала-инициатора
- CRUD интерьеров
- Просмотр изображений товаров
- Библиотека видео с фильтрацией по статусу
- Метки каналов (YouTube ✓/✗, Instagram ✓/✗, TikTok ✓/✗)
- Таймер обратного отсчёта до удаления
- Статистика

---

## Интеграция

### server.js

```javascript
// Инициализация при старте
const videoPipeline = require('./services/videoPipeline.service');
await videoPipeline.init();

// API routes
const videoRoutes = require('./routes/video.routes');
app.use('/api/video', videoRoutes);

// Graceful shutdown
try { require('./services/videoPipeline.service').stopCleanupScheduler(); } catch (_) {}
```

### services/content/index.js

```javascript
const videoPipelineRepo = require('./videoPipeline.repository');
module.exports = {
  // ... existing
  videoPipelineRepo
};
```

---

## Конфигурация

| Переменная | Значение | Описание |
|------------|----------|----------|
| `VIDEO_TEMP_ROOT` | `/var/sandbox-data/.video-temp` | Папка временного хранения |
| `VIDEO_CLEANUP_INTERVAL_MS` | `300000` (5 мин) | Интервал очистки |
| `VIDEO_MODEL` | `veo3.1` | Модель KIE.ai |
| `VIDEO_ASPECT_RATIO` | `9:16` | Формат видео |
| `VIDEO_TIMEOUT_SEC` | `600` | Таймаут генерации |

---

## Статусы видео

```
pending             → Ожидает начала генерации
scene_generating    → Генерируется сцена (image-to-image)
scene_ready         → Сцена готова
video_generating    → Генерируется видео (image-to-video)
video_ready         → Видео готово, ожидает использования
published           → Все каналы использовали, ожидает удаления
expired             → Удалено по таймеру
failed              → Ошибка генерации
```

---

## Временная папка

**Путь:** `/var/sandbox-data/.video-temp/{chatId}/`

**Файлы:**
- `video_{id}_scene.png` — сгенерированная сцена
- `video_{id}.mp4` — готовое видео

**Удаление:** При `cleanupExpiredVideos()` — удаляются файлы + запись из БД.

---

## Checklist реализации

- [x] 1. Миграция БД (`20260410_add_video_pipeline.sql`)
- [x] 2. Репозиторий (`videoPipeline.repository.js`)
- [x] 3. Сервис (`videoPipeline.service.js`)
- [x] 4. API роуты (`video.routes.js`)
- [x] 5. UI (`video.html`, `video.js`)
- [x] 6. server.js — роуты + scheduler + init
- [x] 7. services/content/index.js — экспорт repo
- [ ] 8. youtubeMvp.service.js — claimVideo вместо generateVideo
- [ ] 9. instagramMvp.service.js — claimVideo вместо generateVideo
- [ ] 10. QWEN.md — документация
- [ ] 11. Тесты

---

## Риски и заметки

1. **KIE.ai IMAGE_2_VIDEO**: Необходимо проверить поддержку `generationType: "IMAGE_2_VIDEO"`. Если нет — использовать альтернативный endpoint.

2. **Конкурентный доступ**: Реализовано через `SELECT ... FOR UPDATE SKIP LOCKED`.

3. **Размер видео**: Видео могут быть большими (50-200MB). Регулярная очистка каждые 5 минут.

4. **Fallback**: Если генерация не удалась — канал использует старый flow.

5. **TikTok**: Сервис `tiktokMvp.service.js` пока не существует — будет добавлен отдельно.
