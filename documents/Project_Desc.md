# Описание функциональности проекта Docker-Claw

## Обзор
**Docker-Claw** — это Node.js/Express сервер, предназначенный для создания и управления изолированными Docker-контейнерами (sandbox) для каждого пользователя. Проект предоставляет API для выполнения команд, работы с файлами, базами данных и интеграцию с AI-агентом, который автоматизирует задачи. Управление окружением возможно через веб-интерфейс, Telegram-боты, Email (IMAP/SMTP) и HTTP-вебхуки. Ключевой принцип: один `chat_id` (или сессия) = одна изолированная среда с файлами и PostgreSQL БД.

Проект ориентирован на безопасную автоматизацию разработки и задач с AI-поддержкой, персистентным хранением данных, бэкапами и снапшотами для undo-операций.

**Назначение**: Платформа для non-tech пользователей и разработчиков, где AI-агент самостоятельно выполняет bash-команды, анализирует контекст проекта и отвечает осмысленно.

## Ключевые возможности
- **Изолированные sandbox**: Docker-контейнеры с лимитами CPU/памяти/PID для каждого пользователя.
- **AI-агент в цикле**: Интеграция с ProTalk (LLM-роутер), tool-calls для executeCommand, чтения/записи файлов, HTTP-запросов.
- **Мультиканальное управление**:
  - Веб-панель (public/ HTML/JS).
  - Telegram-боты (Telegraf) с верификацией и AI-режимом.
  - Email-опрос (IMAP cron) и ответы (SMTP).
  - Webhooks и пользовательские хуки (`/hook/:id`).
- **Персистентность**:
  - Bind-mount для файлов (`/workspace` с подпапками input/output/work/apps/tmp/log).
  - PostgreSQL БД на пользователя (авто-провижн).
  - Авто-бэкапы (cron), снапшоты (многоуровневый undo).
  - Кэш проекта (`.project/map.json` для быстрого контекста AI).
- **Персонализация AI**: Файлы `IDENTITY.md`, `SOUL.md`, `USER.md`, `MEMORY.md` в `/workspace`.
- **Дополнительно**:
  - Режимы агента: CHAT, WORKSPACE, TERMINAL.
  - Очередь задач per chat_id.
  - Авто-восстановление сессий при рестарте.
  - MVP для AI-генератора контента (text+image в Telegram-канал с модерацией).

## Архитектура
```
┌─────────────────────────────┐
│     Express Server          │
│  /api/*, /sandbox, /hook    │
└─────────────┬───────────────┘
              │
     ┌────────▼────────┐ ┌─────▼──────────┐
     │ Docker Service  │ │ PostgreSQL     │
     │ (контейнеры)    │ │ (per user)     │
     └────────┬────────┘ └────────────────┘
              │
     ┌────────▼──────────────────────────┐
     │       manage/                     │
     │ Telegram | Email | Agent Loop     │
     └──────────────────────────────────┘
              │
     └────────▼────────┐
              AI Router (ProTalk LLM)
```

- **server.js**: Точка входа, инициализация, cron (cleanup/backup/snapshots), graceful shutdown.
- **services/**: docker.service.js (Docker API), session.service.js (сессии), storage/snapshot/postgres/projectCache.
- **routes/**: REST API (/api/session, /execute, /files, /database, /manage, /webhook, /user_hooks).
- **manage/**: telegram/* (runner, agentLoop, tools), email/processor.js, store.js (персистентное состояние), agentQueue.js.
- **public/**: Веб-интерфейс (pages: index, ai, chat, console, files и т.д.).
- **services/content/**: MVP для контент-генерации (worker, queue, OpenAI images).

## API (префикс /api)
| Эндпоинт | Описание |
|----------|----------|
| `/health` | Статус сервера и сессий. |
| `/session/*` | Создать/статус/удалить сессию. |
| `/execute/*` | Выполнить bash в контейнере. |
| `/files/*` | Листинг/чтение/запись/удаление файлов. |
| `/database/*` | Управление Postgres БД пользователя. |
| `/manage/*` | Настройка каналов (Telegram/Email/AI). |
| `/plans/*`, `/apps/*` | Планы задач и приложения. |
| `/sandbox/*` | Прокси в контейнер. |
| `/webhook` | Входящий webhook → AI-задача. |

## Каналы управления
- **Telegram**:
  - Auth-бот (@DigiStaff_Team_bot).
  - Пользовательские боты: токен из панели → верификация кодом → команды/AI.
  - AI-режим: после настройки ProTalk Bot ID/Token.
- **Email**: IMAP-опрос (каждые 5 мин), SMTP-ответы.
- **Web**: Панели для сессий, файлов, каналов, AI.
- **Hooks**: `/hook/:chatId/*` → запуск handlers в контейнере.

## Безопасность
- Docker лимиты: memory/CPU/PID, no root.
- Блокировка опасных команд (rm -rf /, fork-bombs).
- Верификация Telegram (одноразовый код).
- Таймауты: команда 30с, файл 100MB.
- SSRF-защита в HTTP-tool.
- Рекомендация: Nginx + TLS.

## Конфигурация (.env)
- PG_*: Postgres (host 172.17.0.1 для Docker).
- DATA_ROOT/BACKUP_ROOT/SNAPSHOT_ROOT.
- DOCKER_IMAGE (по умолчанию Node.js 20).
- APP_URL (https для Telegram keyboards).
- AUTH_BOT_TOKEN, ProTalk creds.

## Установка и запуск
1. Docker + Postgres + Node.js.
2. `npm install`.
3. `.env` + mkdir data dirs.
4. `npm start` или systemd.
5. Доступ: `http://localhost:3015`.

## Дополнительные фичи
- **Content MVP**: Генерация text+image по Google Sheets/Drive, публикация в Telegram-канал с approve (services/content/*).
- **Интеграция ProTalk**: AI-роутер для LLM с баланс-чеком.
- **Роли**: ROLE.md описывает агента настройки.

Проект лицензирован MIT, репозиторий: digistaff-team/docker-claw.