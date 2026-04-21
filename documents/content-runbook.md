# Content Pipeline Runbook

## Обзор

Этот документ описывает эксплуатацию контент-пайплайна: генерация текста/изображений, модерация и публикация в Telegram-канал.

---

## Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `CONTENT_MVP_TIME` | Время ежедневной публикации (HH:MM) | `09:00` |
| `CONTENT_MVP_TZ` | Часовой пояс | `Europe/Moscow` |
| `CONTENT_MVP_DAILY_LIMIT` | Максимум публикаций в день | `1` |
| `CONTENT_MVP_MAX_IMAGE_ATTEMPTS` | Попыток генерации изображения | `3` |
| `CHANNEL_ID` | ID Telegram-канала | `-1002263032027` |
| `CONTENT_MVP_MODERATOR_USER_ID` | ID модератора | `128247430` |
| `OPENAI_API_KEY` | Ключ для генерации изображений | — |
| `CONTENT_MVP_SHEET_URL` | URL Google Sheets с темами | — |
| `CONTENT_MVP_SHEET_GID` | GID листа с темами | `164844003` |
| `CONTENT_MVP_DRIVE_FOLDER_URL` | URL папки Google Drive с материалами | — |

### TASK-015: Video-генерация

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `CONTENT_MVP_CONTENT_TYPE` | Тип контента: `text+image` или `text+video` | `text+image` |
| `VIDEO_PROVIDER` | Провайдер видео: `runway`, `pika`, `mock` | `runway` |
| `VIDEO_TIMEOUT_SEC` | Таймаут генерации видео (секунды) | `300` (5 мин) |
| `VIDEO_POLL_INTERVAL_SEC` | Интервал polling'а статуса (секунды) | `10` |
| `VIDEO_FALLBACK_ENABLED` | Fallback на image при ошибке/timeout | `true` |
| `RUNWAY_API_KEY` | API-ключ RunwayML | — |
| `PIKA_API_KEY` | API-ключ Pika Labs | — |

---

## Архитектура

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Scheduler      │───►│  Queue (DB)      │───►│  Worker         │
│  (tick per min) │    │  content_job_    │    │  (poll + claim) │
└─────────────────┘    │  queue           │    └─────────────────┘
                       └──────────────────┘              │
                                                         ▼
                       ┌──────────────────────────────────────────┐
                       │  Job Handlers:                           │
                       │  - generate (text + image/video)          │
                       │  - publish (to Telegram channel)          │
                       │  - video polling (async generation)       │
                       └──────────────────────────────────────────┘
                                    │
                                    ▼
                       ┌──────────────────────────────────────────┐
                       │  Telegram Bot:                            │
                       │  - /post_now → enqueue generate           │
                       │  - approve → enqueue publish              │
                       │  - reject → regenerate                    │
                       └──────────────────────────────────────────┘
```

### TASK-015: Video Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  generate job   │───►│  video.service   │───►│  Worker polling │
│  (text+video)   │    │  startGeneration │    │  (every 10s)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  video_          │    │  checkStatus    │
                       │  generations     │    │  (Runway/Pika)  │
                       └──────────────────┘    └─────────────────┘
                                                       │
                               ┌───────────────────────┼───────────────────────┐
                               ▼                       ▼                       ▼
                       ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
                       │  completed  │         │  failed/    │         │  timeout   │
                       │  → ready    │         │  timeout    │         │  → fallback│
                       └─────────────┘         └─────────────┘         └─────────────┘
                                                       │                       │
                                                       ▼                       ▼
                                               ┌─────────────────────────────────────┐
                                               │  Fallback: generate image           │
                                               │  (if VIDEO_FALLBACK_ENABLED=true)   │
                                               └─────────────────────────────────────┘
```

---

## Команды бота

### `/post_now`
Запускает генерацию контента немедленно. Ставит задачу в очередь с высоким приоритетом.

### Callback-кнопки модерации

| Кнопка | Действие |
|--------|----------|
| ✅ Approve | Публикует пост в канал |
| 🔁 Regenerate Text | Перегенерирует текст, отправляет повторно |
| 🖼 Regenerate Image | Перегенерирует изображение, отправляет повторно |
| 🎬 Regenerate Video | Перегенерирует видео (только для text+video) |
| ❌ Reject | После 3 отклонений — требует ручной переработки |

---

## REST API

### `POST /api/content/run-now`
Запустить генерацию контента.

```json
{
  "chat_id": "12345"
}
```

### `GET /api/content/jobs?chat_id=...&status=...`
Список задач с фильтрацией.

### `GET /api/content/jobs/:id?chat_id=...`
Детали задачи с логами публикации.

### `POST /api/content/jobs/:id/approve`
Опубликовать пост.

```json
{
  "chat_id": "12345"
}
```

### `POST /api/content/jobs/:id/reject`
Отклонить пост.

### `GET /api/content/metrics?chat_id=...`
Метрики пайплайна за 24h/7d.

---

## Диагностика проблем

### Пост не публикуется

1. **Проверить статус задачи:**
   ```sql
   SELECT id, status, error_text FROM content_jobs ORDER BY created_at DESC LIMIT 5;
   ```

2. **Проверить очередь:**
   ```sql
   SELECT * FROM content_job_queue WHERE status != 'done' ORDER BY created_at DESC;
   ```

3. **Проверить логи публикации:**
   ```sql
   SELECT * FROM publish_logs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10;
   ```

4. **Проверить correlation_id для трассировки:**
   ```sql
   SELECT correlation_id, status, error_text FROM content_jobs WHERE id = <job_id>;
   SELECT correlation_id, status, error_text FROM publish_logs WHERE correlation_id = '<corr_id>';
   ```

### Задачи "застряли" в processing

```sql
-- Найти застрявшие задачи
SELECT * FROM content_job_queue 
WHERE status = 'processing' 
  AND started_at < NOW() - INTERVAL '10 minutes';

-- Сбросить обратно в очередь
UPDATE content_job_queue 
SET status = 'queued', started_at = NULL 
WHERE status = 'processing' 
  AND started_at < NOW() - INTERVAL '10 minutes';
```

### Превышен лимит публикаций

```sql
-- Проверить количество публикаций сегодня
SELECT COUNT(*) FROM publish_logs 
WHERE status = 'published' 
  AND created_at >= CURRENT_DATE;

-- При необходимости сбросить счётчик (изменить дату в manage-state)
```

### Изображение не генерируется

1. Проверить `OPENAI_API_KEY` в `.env`
2. Проверить баланс OpenAI
3. Посмотреть `image_attempts` в `content_jobs`:
   ```sql
   SELECT id, image_attempts, error_text FROM content_jobs WHERE image_attempts >= 3;
   ```

### TASK-015: Видео не генерируется

1. **Проверить API-ключ провайдера:**
   - `RUNWAY_API_KEY` для RunwayML
   - `PIKA_API_KEY` для Pika Labs

2. **Проверить статус генерации:**
   ```sql
   SELECT generation_id, status, progress, error_text 
   FROM video_generations 
   WHERE status NOT IN ('completed', 'failed', 'timeout')
   ORDER BY created_at DESC;
   ```

3. **Проверить jobs в статусе MEDIA_GENERATING:**
   ```sql
   SELECT j.id, j.content_type, j.status, v.generation_id, v.status as video_status
   FROM content_jobs j
   LEFT JOIN video_generations v ON v.job_id = j.id
   WHERE j.status = 'media_generating';
   ```

4. **Принудительный fallback на изображение:**
   ```sql
   -- Отметить генерацию как timeout
   UPDATE video_generations 
   SET status = 'timeout', error_text = 'manual fallback' 
   WHERE generation_id = '<generation_id>';
   
   -- Job автоматически упадёт в fallback при следующем polling'е
   ```

5. **Проверить лимиты видео:**
   ```sql
   SELECT COUNT(*) FROM content_assets 
   WHERE asset_type = 'video' 
     AND created_at >= CURRENT_DATE;
   ```

---

## Восстановление после сбоев

### Перезапуск сервера

При перезапуске:
1. Worker автоматически восстановит задачи из очереди
2. Задачи в статусе `processing` будут сброшены через 10 минут
3. Scheduler продолжит с текущего состояния

### Потеря данных

1. Бэкапы БД хранятся в `backups/`
2. Состояние модерации — в `manage-state-<chatId>.json`
3. Изображения — в контейнере `/workspace/output/content/`

---

## Мониторинг

### Метрики для отслеживания

| Метрика | Описание | Порог алерта |
|---------|----------|--------------|
| `success_rate_24h` | % успешных публикаций | < 80% |
| `queue_backlog` | Задач в очереди | > 10 |
| `stuck_jobs` | Застрявших задач | > 0 |
| `no_success_hours` | Часов без публикаций | > 24 |

### Алерты

Система автоматически отправляет алерты модератору при:
- 3+ подряд неудачных попытках публикации
- 24+ часах без успешных публикаций
- Застрявших задачах в очереди

---

## Статусы задач

### JOB_STATUS

| Статус | Описание | Следующие статусы |
|--------|----------|-------------------|
| `draft` | Создан, не обработан | `media_generating`, `ready`, `failed` |
| `media_generating` | Генерация медиа | `ready`, `failed` |
| `ready` | Готов к модерации | `approved`, `failed` |
| `approved` | Одобрен модератором | `published`, `failed` |
| `published` | Опубликован в канал | — (терминальный) |
| `failed` | Ошибка | `media_generating`, `ready` |

### QUEUE_STATUS

| Статус | Описание |
|--------|----------|
| `queued` | В очереди на обработку |
| `processing` | Обрабатывается worker'ом |
| `done` | Успешно выполнено |
| `failed` | Ошибка, retry исчерпаны |

---

## Контакты

При критических проблемах:
1. Проверить логи: `docker logs <container>`
2. Перезапустить сервис: `pm2 restart all`
3. Связаться с разработчиком

---

## Changelog

| Дата | Изменение |
|------|-----------|
| 2026-03-18 | Добавлена БД-очередь, валидация статусов, алерты |
| 2026-03-18 | Модульная архитектура `services/content/` |
