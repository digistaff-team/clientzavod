# План: Интеграция Facebook через Buffer API для Docker-Claw

## Context

**Зачем:** Расширить функционал платформы для автоматической генерации и публикации контента в Facebook через Buffer API. Это позволит пользователям создавать SMM-контент для Facebook с тем же уровнем автоматизации, что уже реализован для VK, OK, Pinterest, Instagram и YouTube.

**Проблема:** Пользователи не могут публиковать контент в Facebook — один из крупнейших каналов для SMM-маркетинга.

**Решение:** Полноценная интеграция Facebook через Buffer API с генерацией контента, модерацией через CW_BOT и автоматической публикацией по расписанию.

---

## Архитектурные решения (утверждены)

1. **Хранение данных:** Отдельная таблица `facebook_jobs` (аналогично `pinterest_jobs`, `instagram_jobs`)
2. **Типы контента:** Текст + изображение (photo) — базовый вариант для MVP
3. **Страницы:** Одна Facebook страница на пользователя (один `buffer_channel_id`)

---

## Прогресс реализации

### ✅ Этап 1: База данных (migrations/002_add_facebook_tables.sql)
- [x] Создана миграция для центральной БД (`content_channels` расширение)
- [x] SQL для per-user таблиц (создаётся через `ensureSchema` в репозитории)
- [x] Индексы для оптимизации запросов

### ✅ Этап 2: Репозиторий (services/content/facebook.repository.js)
- [x] Создан репозиторий `facebook.repository.js`
- [x] Реализован `ensureSchema(chatId)` — создание таблиц
- [x] Реализован `createJob(chatId, data)` — создание задачи
- [x] Реализован `updateJob(chatId, updates)` — обновление
- [x] Реализован `getJobById(chatId, jobId)` — получение по ID
- [x] Реализован `listJobs(chatId, {status, limit, offset})` — список с фильтрацией
- [x] Реализован `addPublishLog(chatId, logData)` — запись лога
- [x] Реализован `countPublishedToday(chatId)` — публикаций сегодня
- [x] Реализован `markPublished(chatId, jobId, postId)` — отметить как опубликованный
- [x] Реализован `getConsecutiveFailures(chatId)` — подряд неудачные публикации
- [x] Реализован `getQueueBacklog(chatId)` — задачи в очереди

### ✅ Этап 3: Конфигурация в store.js (manage/store.js)
- [x] Добавлены методы `getFacebookConfig`, `setFacebookConfig`, `clearFacebookConfig`
- [x] Добавлены в module.exports
- [x] Сохранение полей: buffer_api_key, buffer_channel_id, page_name, is_active, auto_publish, schedule_time, schedule_tz, daily_limit, publish_interval_hours, random_publish, allowed_weekdays, moderator_user_id, stats

### ✅ Этап 4: Основной сервис (services/facebookMvp.service.js)
- [x] Создан полный сервис `facebookMvp.service.js`
- [x] Реализован `getFacebookSettings(chatId)` — загрузка настроек
- [x] Реализован `generateFbPostText(chatId, topic, materialsText, personaText)` — AI генерация текста
- [x] Реализован `generateFbImage(chatId, topic, imagePrompt, jobId)` — генерация через KIE + fallback на imageService
- [x] Реализован `saveImageToContainer(chatId, imageBuffer, jobId)` — сохранение в контейнер
- [x] Реализован `handleFacebookGenerateJob(chatId, queueJob, bot, correlationId)` — worker handler
- [x] Реализован `publishFbPost(chatId, bot, jobId, correlationId)` — публикация через Buffer
- [x] Реализован `sendFbToModerator(chatId, bot, draft)` — отправка на модерацию
- [x] Реализован `handleFacebookModerationAction(chatId, bot, jobId, action)` — действия (approve/reject/regen_text/regen_image)
- [x] Реализован `tickFacebookSchedule(chatId, bot)` — планировщик
- [x] Реализован `runNow(chatId, bot, reason)` — ручной запуск
- [x] Реализованы функции `startScheduler()`, `stopScheduler()`, `registerWorkerHandlers()`
- [x] FSM статусов: draft → media_generating → ready → approved → published/failed

### ✅ Этап 5: Endpoints в routes/content.routes.js
- [x] Добавлен импорт `facebookMvpService`
- [x] POST `/api/content/facebook/run-now` — генерация сейчас
- [x] GET `/api/content/facebook/jobs` — список задач
- [x] GET `/api/content/facebook/jobs/:id` — задача по ID
- [x] POST `/api/content/facebook/jobs/:id/:action` — модерация (approve/reject/regen_text/regen_image)
- [x] GET `/api/content/facebook/settings` — настройки

### ✅ Этап 6: Manage endpoints в manage/routes.js
- [x] GET `/api/manage/channels/facebook` — получить конфигурацию
- [x] POST `/api/manage/channels/facebook` — сохранить конфигурацию
- [x] DELETE `/api/manage/channels/facebook` — отключить Facebook
- [x] POST `/api/manage/channels/facebook/test-buffer` — тест подключения к Buffer

### ✅ Этап 7: UI вкладка в public/channels.html
- [x] Добавлена панель `channelPanel-facebook` после YouTube
- [x] Поля: Buffer API Token, Channel selector, настройки (активность, автопубликация, время, дней недели, лимиты)
- [x] Кнопки: Загрузить каналы, Проверить подключение, Сохранить настройки, Сгенерировать сейчас

### ✅ Этап 8: UI логика (public/js/channels-facebook.js)
- [x] Создан файл `public/js/channels-facebook.js`
- [x] Реализован `fetchFacebookBufferChannels()` — загрузка каналов из Buffer
- [x] Реализован `testFacebookBufferConnection()` — проверка подключения
- [x] Реализован `loadFacebookConfig()` — загрузка конфигурации
- [x] Реализован `saveFacebookConfig()` — сохранение конфигурации
- [x] Реализован `runFacebookNow()` — запуск генерации

### ✅ Этап 9: Регистрация вкладки (public/js/channels.js)
- [x] Добавлена загрузка `loadFacebookConfig()` при клике на вкладку Facebook
- [x] Добавлен вызов `loadFacebookConfig()` в `loadAllChannelsStatus()`
- [x] Добавлен `<script src="/js/channels-facebook.js"></script>` в channels.html

### ✅ Этап 10: Экспорт репозитория (services/content/index.js)
- [x] Добавлен импорт `facebookRepo = require('./facebook.repository')`
- [x] Добавлен `facebookRepo` в module.exports

### ✅ Этап 11: Регистрация планировщика (server.js)
- [x] Добавлен импорт `facebookMvpService`
- [x] Добавлен запуск планировщика `facebookMvpService.startScheduler()`
- [x] Добавлен остановка планировщика при graceful shutdown

### ✅ Этап 12: Алерты (services/content/alerts.js)
- [x] Добавлены пороги в `ALERT_THRESHOLDS`: facebookConsecutiveFailures, facebookQueueBacklog, facebookRateLimit
- [x] Реализован `checkFacebookConsecutiveFailures(chatId)` — подряд неудачные публикации
- [x] Реализован `checkFacebookQueueBacklog(chatId)` — задачи в очереди
- [x] Реализован `checkFacebookRateLimit(chatId)` — проверка rate limits
- [x] Добавлены функции в `checkAndAlert()` для проверки Facebook алертов
- [x] Добавлены экспорты новых функций

### ✅ Этап 13: Лимиты (services/content/limits.js)
- [x] Добавлен `FACEBOOK_PUBLICATION` в `QUOTA_TYPES`
- [x] Добавлено поле `facebookPublished` в `getTodayUsage()` return
- [x] Добавлен case `FACEBOOK_PUBLICATION` в `checkQuota()` с проверкой daily limit
- [x] Добавлено поле `facebook` в `percentages` в `getUsageStats()`

---

## Оставшиеся этапы (не реализованы)

### Этап 14: Тестирование
- [ ] Создать unit тесты `tests/facebook.mvp.test.js`
- [ ] Создать E2E тесты `tests/e2e/specs/4-facebook-buffer.spec.js`

---

## Константы и конфигурация

**Environment Variables (.env):**
```env
FACEBOOK_DAILY_LIMIT=10
FACEBOOK_MODERATION_TIMEOUT_HOURS=24
CONTENT_MVP_TZ=Europe/Moscow
```

**Кэш изображений:**
```javascript
const IMAGE_CACHE_DIR = '/workspace/cache/images/facebook';
const IMAGE_CACHE_TTL_DAYS = 30;
```

---

## FSM Статусов Facebook

| Статус | Описание | Переходы из |
|--------|----------|--------------|
| draft | Черновик создан | - |
| media_generating | Генерация медиа | draft |
| ready | Контент готов к модерации | media_generating |
| approved | Одобрено модератором | ready |
| published | Опубликовано в Facebook | approved |
| failed | Ошибка на любом этапе | любой |

---

## API Endpoints

### Content Routes (`/api/content/`)

| Метод | Endpoint | Описание |
|-------|----------|-----------|
| POST | `/facebook/run-now` | Генерация сейчас |
| GET | `/facebook/jobs` | Список задач |
| GET | `/facebook/jobs/:id` | Задача по ID |
| POST | `/facebook/jobs/:id/:action` | Модерация (approve/reject/regen_text/regen_image) |
| GET | `/facebook/settings` | Настройки |

### Manage Routes (`/api/manage/`)

| Метод | Endpoint | Описание |
|-------|----------|-----------|
| GET | `/channels/facebook` | Получить конфигурацию |
| POST | `/channels/facebook` | Сохранить конфигурацию |
| DELETE | `/channels/facebook` | Отключить |
| POST | `/channels/facebook/test-buffer` | Тест подключения |

---

## Критические файлы для модификации

| Файл | Назначение |
|-------|------------|
| `services/pinterestMvp.service.js` | Эталонная реализация через Buffer |
| `services/instagramMvp.service.js` | Квадратные изображения (сходно с Facebook) |
| `services/buffer.service.js` | Buffer API интеграция |
| `manage/store.js` | Паттерн хранения конфигураций |
| `services/content/repository.js` | Базовые методы репозитория |
| `routes/content.routes.js` | Структура API endpoints |

---

## Проверка (Verification)

### Unit Testing
```bash
# Запуск тестов
node tests/facebook.mvp.test.js

# Все тесты
npm test
```

### E2E Testing
```bash
# Запуск E2E для Facebook
npx playwright test tests/e2e/specs/4-facebook-buffer.spec.js

# С headed режимом
npx playwright test tests/e2e/specs/4-facebook-buffer.spec.js --headed
```

### Ручное тестирование

1. **Подключение:**
   - Открыть `/channels.html` → вкладка Facebook
   - Ввести Buffer API Token
   - Загрузить каналы, выбрать Facebook канал
   - Нажать "Проверить подключение"
   - Ожидать: ✅ Подключено

2. **Настройка:**
   - Установить параметры (время, дни, лимиты)
   - Нажать "Сохранить настройки"
   - Ожидать: ✅ Сохранено

3. **Генерация:**
   - Нажать "Сгенерировать сейчас"
   - Ожидать: Создана запись в `facebook_jobs` со статусом `ready`

4. **Модерация (если auto_publish отключен):**
   - Проверить сообщение в Telegram от CW_BOT
   - Нажать "Одобрить"
   - Ожидать: Статус → `approved`, затем `published`

5. **Публикация в Buffer:**
   - Проверить logs Buffer API
   - Ожидать: POST createPost с корректными параметрами

---

## Примечания

- Кэш изображений очищается автоматически по TTL через `projectCache.service.js`
- Rate limits Buffer обрабатываются в `buffer.service.js` с exponential backoff
- При достижении daily_limit планировщик пропускает генерацию с логом
- Модерация доступна только если `auto_publish: false`
- CW_BOT используется для модерации, уведомлений об ошибках и алертах
- Статистика хранится в `facebookConfig.stats` и обновляется после каждой публикации
