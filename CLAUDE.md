# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Docker-Claw (Клиент Завод) v3.0.0 — AI-powered platform that manages isolated Docker containers per user, enables task execution through Telegram/Email, and provides automated content generation and publishing to Telegram channels.

**Stack:** Node.js 18 + Express.js, PostgreSQL 15, Docker, Telegraf (Telegram), nodemailer/imap-simple (Email). Frontend is static HTML/CSS/JS (no framework).

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Development with nodemon auto-reload
npm start            # Production: node server.js
npm test             # Run tests (Node.js assert, no test runner)

# Docker
docker-compose up -d           # Start all services (postgres, nginx, app)
docker-compose logs -f app     # View app logs
docker-compose down            # Stop all
```

Server runs on port 3015 by default. Config loaded from `.env` + `.env.local` (override).

## Architecture

### Core Flow

1. User authenticates via Telegram auth bot → creates session → Docker container spawned (`sandbox-user-{chatId}`)
2. Per-user PostgreSQL database auto-provisioned
3. Commands executed inside isolated container via `/api/execute`
4. AI agent loop processes messages through LLM with tool-calling pattern

### Key Subsystems

**Session & Container Management:**
- `services/session.service.js` — in-memory session Map, lifecycle management
- `services/docker.service.js` — container CRUD, resource limits, command execution
- `services/storage.service.js` — backups, file persistence at `/var/sandbox-data`

**Telegram Bot (two-bot system):**
- `manage/telegram/authBot.js` — central auth bot (one global instance); sends one-time login token via `POST /api/auth/telegram-login`
- `routes/auth.routes.js` — auth endpoints; issues 10-minute one-time tokens for Telegram web login; redirects to `/auth.html?tg_login_token=<hex>`
- `manage/telegram/runner.js` (51KB) — per-user bot lifecycle, message routing
- `manage/telegram/agentLoop.js` (47KB) — AI reasoning loop with tool-call pattern
- `manage/telegram/toolHandlers.js` (77KB) — tool implementations (executeCommand, readFile, writeFile, etc.)
- `manage/telegram/tools.js` (24KB) — tool definitions sent to LLM

**Content MVP (automated publishing):**
- `services/content/` — modular subsystem with status machine, validators, queue, worker, video support
- `services/contentMvp.service.js` (70KB) — orchestrator: generation, scheduling, publishing; runs scheduler every 60s for per-user tasks
- Status flow: `draft → ready → approved → published` (with error/failed paths)
- Schema in `content_schema.sql`
- **Alerts disabled** — `checkAndAlert()` removed from scheduler; no automatic error notifications sent

**AI Integration:**
- `services/ai_router_service.js` — LLM routing (ProTalk integration)
- `manage/prompts.js` — system prompts for AI agent
- `manage/context.js` — context builder for LLM calls

### Route Structure

All API routes registered in `routes/index.js`. Key endpoints:
- `/api/session/*` — container lifecycle
- `/api/execute` — bash execution in container
- `/api/files/*` — file upload/download/manage
- `/api/content/*` — content CRUD and publishing
- `/api/manage/*` — Telegram/Email/AI settings
- `/admin/*` — admin panel (password-protected)
- `/sandbox/*` — proxy to container endpoints

### Configuration

All env vars centralized in `config.js`. Critical ones: `PORT`, `PG_*`, `DOCKER_IMAGE`, `AUTH_BOT_TOKEN`, `BOT_TOKEN`, `CHANNEL_ID`, `OPENAI_API_KEY`, `KIE_API_KEY`, `ADMIN_PASSWORD`.

### Frontend

Static files in `public/`. Each page is a standalone HTML file with corresponding JS in `public/js/`. Shared utilities in `public/js/common.js` (handles `initAuth()`, one-time token redemption). Styling in `public/css/main.css`.

**Key Pages:**
- `index.html` — landing/marketing page (no auth required)
- `auth.html` — entry point after Telegram login; calls `initAuth()` to process `tg_login_token` from bot; shows login form if not authenticated
- `console.html`, `ai.html`, `files.html`, etc. — authenticated pages with user interface

## Testing

Tests are in `tests/` using Node.js built-in `assert` module (no framework). Two test files:
- `tests/content.status.test.js` — status machine transitions
- `tests/validators.extended.test.js` — content validation, forbidden topics, quotas

Run a single test: `node tests/content.status.test.js`

## Language

The project documentation (README.md, commits, UI) is primarily in Russian.
