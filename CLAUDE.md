# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Docker-Claw (Клиент Завод) v3.0.0** — AI-платформа для управления изолированными Docker-контейнерами. Каждый пользователь получает персональный контейнер (Node.js-среда), персональную PostgreSQL БД и Telegram-бота. Публикация контента в Telegram, ВКонтакте, OK, Pinterest, Instagram (фото + Reels), TikTok, YouTube, Facebook, WordPress, VK Video.

**Стек:** Node.js 18 + Express.js, PostgreSQL 15, MySQL 8 (навыки), Docker, Telegraf, Buffer API, YouTube Data API, WordPress REST API, KIE.ai API. Фронтенд — статические HTML/CSS/JS (без фреймворка). Playwright для E2E.

---

## Commands

```bash
npm install          # Установить зависимости
npm run dev          # Development: nodemon + auto-reload
npm start            # Production: node server.js

# Тесты (Node.js assert, без раннера)
npm test                                    # Все unit-тесты (9 файлов)
node tests/content.status.test.js
node tests/validators.extended.test.js
node tests/wordpress.publisher.test.js
node tests/blog.generator.test.js
node tests/blog.moderation.test.js
node tests/video.pipeline.test.js
node tests/inputImageContext.test.js
node tests/channel.topics.test.js

# Отдельно (не в npm test)
node tests/vk.moderation.test.js
node tests/vk.publisher.test.js
node tests/youtube.mvp.test.js

# E2E (Playwright)
npm run test:e2e
npm run test:e2e:smoke                      # Только critical path

# Docker
docker-compose restart app     # Применить изменения кода
docker-compose up -d
docker-compose logs -f app
docker-compose down
```

Порт `3015`. Конфиг: `.env` + `.env.local` (`.env.local` переопределяет). Все переменные — в `config.js`.

**При изменении любого backend-файла:** `docker-compose restart app`.

---

## Architecture

### Поток данных

```
Telegram auth bot → one-time token → /auth.html → сессия создана
    ↓
Docker container spawned (sandbox-user-{chatId})
    ↓
Per-user PostgreSQL DB auto-provisioned (db_{chatId})
    ↓
AI агент (agentLoop) обрабатывает сообщения через LLM с tool-calling
    ↓
Контент генерируется и публикуется по расписанию (каждые 60 сек)
```

### Два Telegram-бота

- **Auth Bot** (`AUTH_BOT_TOKEN`, `manage/telegram/authBot.js`) — `/start`, выдаёт login-токен
- **CW Bot** (`CW_BOT_TOKEN`) — модерация контента для всех пользователей. Callback-префиксы: `content:` (TG), `vk_mod:`, `ok_mod:`, `ig_mod:`, `yt_mod:`, `pin_mod:`, `wp_mod:`, `tt_mod:`, `vk_vid_mod:`. Webhook или long polling fallback
- Режимы user-бота: CHAT, WORKSPACE, TERMINAL

### Базы данных

1. **PostgreSQL центральная** (`clientzavod`) — `content_queue`, `content_channels`, `content_analytics`, `content_templates`, `content_assets`, `content_workflow`, `content_import_sources`
2. **PostgreSQL per-user** (`db_{chatId}`) — `content_jobs`, `content_posts`, `content_job_queue`, `publish_logs`, `content_topics`, `content_config`, `content_knowledge_base`, `vk_jobs`, `ok_jobs`, `pinterest_jobs`, `facebook_jobs`, `video_assets`, `interiors`, `video_channel_usage`
3. **MySQL** (`ai_skills_db`) — `ai_skills`, `user_selected_skills`. Init: `services/mysql/init.sql`

### Маршрутизация

`routes/index.js` под `/api`: `/session`, `/execute`, `/files`, `/database`, `/manage`, `/plans`, `/apps`, `/content`, `/auth`, `/health`.

`server.js` (порядок важен):
- `/admin` → `routes/admin.routes.js`
- `/sandbox` → `routes/sandbox.routes.js`
- `/api` → `routes/index.js`
- `/api/video` → `routes/video.routes.js` (до `'/'`)
- `/hook` → `routes/user_hooks.routes.js`
- `/` → `routes/webhook.routes.js` (последним — перехватывает все пути)

`/api/manage/*` — `manage/routes.js`. `/api/content/*` — `routes/content.routes.js`.

### Фильтрация тем по каналу (КРИТИЧНО)

`reserveNextTopic(chatId, channel)` в `services/content/repository.js`. Топики с `channel IS NULL` — универсальные.

**11 допустимых значений `content_topics.channel`:** `telegram`, `vk`, `vk_video`, `ok`, `instagram`, `instagram_reels`, `facebook`, `pinterest`, `youtube`, `wordpress`, `tiktok`.

Валидация: `normalizeChannel(value)` + `VALID_CHANNELS` в `services/telegramMvp.service.js`.

**Жизненный цикл топика:**
- `reserveNextTopic` → `status = 'used'`
- Ошибка генерации → `releaseTopic` → `status = 'pending'`
- Успех → `updateTopicStatus(chatId, topicId, 'completed')`

Facebook хранит `topic_id` в `facebook_jobs` для вызова `updateTopicStatus` после публикации.

### Контент-пайплайн

FSM: `draft → ready → approved → published` (+ `error/failed`).

AI генерирует черновик → если `premoderationEnabled` → CW Bot (✅/🔁/❌) → очередь → worker → публикация. `services/content/`: `index.js`, `repository.js`, `queue.repository.js`, `worker.js`, `status.js`, `validators.js`, `limits.js`, `video.service.js`, `alerts.js`.

### Frontend (КРИТИЧНЫЕ ПРАВИЛА)

**Auth pattern:** `common.js` объявляет `let currentChatId` и `getChatId()`. Page-specific JS определяет `async function onLoginSuccess()`. **Не объявлять `let currentChatId` в page-specific JS** — вызовет `SyntaxError: Identifier already been declared`.

**Channel scheduler:** Использовать утилиты из `public/js/timezone-helper.js`: `generateTimezoneSelect`, `generateWeekdayCheckboxes`, `getWeekdays`, `setWeekdays`. Эталон: `public/templates/channel-scheduler-template.html`. Сложная логика — в отдельный файл (`channels-wordpress.js`, `channels-facebook.js`). Инициализация через `initSchedulerChannels()` в `channels.js`.

Страницы UI: `index.html`, `auth.html`, `setup.html`, `channels.html`, `content.html`, `console.html`, `files.html`, `ai.html` (настройки моделей), `skills.html`, `balance.html`, `info.html`. Навигация: `renderMenu(activePath)` в `public/js/common.js`.

### Файловая система

```
/var/sandbox-data/                     # DATA_ROOT
├── manage-state-{chatId}.json
├── .video-temp/{chatId}/              # Временные файлы видео-пайплайна
└── {chatId}/                          # → /workspace в контейнере
    ├── input/                         # Фото товаров для видео-пайплайна
    └── output/content/                # Очищается в 05:00 МСК

/var/sandbox-backups/{chatId}_{timestamp}/   # TTL 7 дней
/var/sandbox-snapshots/{chatId}/{path}/{ts}.snap
```

### Авторизация

Auth Bot → `POST /api/auth/telegram-login` → hex token (TTL 10 мин) → `/auth.html` → `chatId` в localStorage. Admin-авторизация: query-параметры `admin_auth` + `chatId` (токен в `state.adminAuthToken`).

---

## Подробная документация

- @docs/architecture.md — таблица подсистем, сервисы каналов, admin panel
- @docs/video-pipeline.md — KIE.ai адаптеры, модели изображений/видео
- @docs/migrations.md — список SQL-миграций
