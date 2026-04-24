# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Tool preferences

Read > `cat`/`head`/`tail`. Glob > `find`. Grep > `grep`/`rg`. Edit > `sed`/`awk`. Native tools stream ranged output; Bash pipes dump everything.

---

## Project Overview

**Docker-Claw (Клиент Завод) v3.0.0** — AI-платформа для управления Docker-контейнерами. Каждый пользователь: персональный контейнер (Node.js), PostgreSQL БД, Telegram-бот. Каналы: Telegram, VK, OK, Pinterest, Instagram (фото+Reels), TikTok, YouTube, Facebook, WordPress, VK Video.

**Стек:** Node.js 18 + Express.js, PostgreSQL 15, MySQL 8, Docker, Telegraf, Buffer API, YouTube Data API, WordPress REST API, KIE.ai API. Фронтенд — статические HTML/CSS/JS. Playwright для E2E.

---

## Commands

```bash
npm install && npm run dev   # dev (nodemon); npm start — prod
npm test                     # 9 unit-тестов (Node.js assert, без раннера)
npm run test:e2e             # Playwright; :smoke :ui :debug :ci — варианты
docker-compose restart app   # после ЛЮБЫХ backend-изменений
docker-compose logs -f app
```

Порт `3015`. Конфиг: `.env` + `.env.local` (переопределяет). Все переменные — в `config.js`.

---

## Architecture

### Поток данных

```
Telegram auth bot → one-time token → /auth.html → сессия
    ↓ Docker container spawned (sandbox-user-{chatId})
    ↓ Per-user PostgreSQL DB auto-provisioned (db_{chatId})
    ↓ AI агент (agentLoop) → LLM tool-calling → публикация по расписанию (60 сек)
```

### Два Telegram-бота

- **Auth Bot** (`AUTH_BOT_TOKEN`, `manage/telegram/authBot.js`) — `/start`, login-токен
- **CW Bot** (`CW_BOT_TOKEN`) — модерация для всех пользователей. Callback-префиксы: `content:` (TG), `vk_mod:`, `ok_mod:`, `ig_mod:`, `yt_mod:`, `pin_mod:`, `wp_mod:`, `tt_mod:`, `vk_vid_mod:`, `fb_mod:`. **ВАЖНО:** `moderator_user_id` в JSON — число, `fromId` из Telegram — строка; сравнивать только через `String()`, иначе `Set.has()` молча не срабатывает.
- Режимы user-бота: CHAT, WORKSPACE, TERMINAL

### Базы данных

1. **PostgreSQL центральная** (`clientzavod`) — `content_queue`, каналы, аналитика, шаблоны, assets, workflow, import_sources
2. **PostgreSQL per-user** (`db_{chatId}`) — jobs, posts, topics, configs, knowledge_base, jobs по каналам, video_assets, interiors
3. **MySQL** (`ai_skills_db`) — `ai_skills`, `user_selected_skills`. Init: `services/mysql/init.sql`

**Три хоста PostgreSQL в `config.js`:** `PG_HOST` (Node.js), `PG_ADMIN_HOST` (CREATE/DROP DB), `PG_SANDBOX_HOST` (sandbox-контейнеры, передаётся через `DATABASE_URL`). В Docker часто различаются — несовпадение вызывает молчаливые сбои при провизионинге `db_{chatId}`.

### Маршрутизация

`server.js` (порядок важен): `/admin` → `/sandbox` → `/api` → `/api/video` (до `'/'`) → `/hook` → `/` (webhook — последним, перехватывает всё).  
`/api/manage/*` — `manage/routes.js`. `/api/content/*` — `routes/content.routes.js`.

### Фильтрация тем по каналу (КРИТИЧНО)

`reserveNextTopic(chatId, channel)` в `services/content/repository.js`. Топики с `channel IS NULL` — универсальные. Валидация через `normalizeChannel(value)` + `VALID_CHANNELS` в `services/telegramMvp.service.js`.

**Жизненный цикл:** `reserveNextTopic` → `status='used'`; ошибка → `releaseTopic` → `status='pending'`; успех → `updateTopicStatus(chatId, topicId, 'completed')`. Facebook хранит `topic_id` в `facebook_jobs`.

**Конфиги каналов в `manage-state-{chatId}.json`:** `instagramConfig`, `facebookConfig`, `vkConfig`, `okConfig`, `pinterestConfig`, `wordpressConfig`, `tiktokConfig`. Глобальный `buffer_api_key` — в `integrationSettings`. Instagram требует привязки к Facebook Странице (иначе "media issue"). После переподключения в Buffer ID канала меняется — нужно перевыбрать.

### Контент-пайплайн

FSM: `draft → ready → approved → published` (+ `error/failed`). `services/content/index.js` — фасад. Канальные репозитории (`vk`, `ok`, `pinterest`, `youtube`, `instagram`, `wordpress`, `facebook`) — **отдельные модули**, не реэкспортируются из index.

### Frontend (КРИТИЧНЫЕ ПРАВИЛА)

**Auth pattern:** `common.js` объявляет `let currentChatId` и `getChatId()`. **Не объявлять `let currentChatId` в page-specific JS** — вызовет `SyntaxError: Identifier already been declared`.

**Channel scheduler:** Утилиты из `public/js/timezone-helper.js` (`generateTimezoneSelect`, `generateWeekdayCheckboxes`, `getWeekdays`, `setWeekdays`). Эталон: `public/templates/channel-scheduler-template.html`. Инициализация через `initSchedulerChannels()` в `channels.js`.

### Sandbox-контейнеры

`sandbox-user-{chatId}`. Workspace хоста `/var/sandbox-data/{chatId}/` → `/workspace/`. `PG_SANDBOX_HOST` должен быть bridge IP (например `172.17.0.1`) — иначе sandbox не достучится до PostgreSQL.

### Добавление нового канала (8 мест)

1. `VALID_CHANNELS` + `normalizeChannel()` в `services/telegramMvp.service.js`
2. Getter/setter конфига в `manage/store.js`
3. API-роуты в `manage/routes.js` (`GET/POST/DELETE /channels/{name}`, `/run-now`, `/settings`)
4. Репозиторий `services/content/{name}.repository.js`
5. Job handler в `services/content/worker.js`
6. Лимиты в `services/content/limits.js`
7. SQL-миграция в `migrations/`
8. UI в `public/channels.html` + `channels.js`

### Известные ограничения

- Facebook daily limit захардкожен как `10` в `limits.js` (TODO: из `facebookConfig.daily_limit`)
- TikTok random publish не реализован — TODO
- `APP_URL` в `.env` должен быть `https://`

---

## Подробная документация

- @docs/architecture.md — подсистемы, сервисы каналов, admin panel
- @docs/video-pipeline.md — KIE.ai адаптеры, модели изображений/видео
- @docs/migrations.md — SQL-миграции
