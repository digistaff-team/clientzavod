# Design: clientzavod-solo

**Date:** 2026-04-22
**Status:** Approved

## Overview

Single-user fork of Docker-Claw (clientzavod) for self-hosted deployment. One business — one installation. No Docker-per-user isolation, no AI agent, only the content publishing pipeline for 7 channels.

Distributed as a private GitHub repository (`clientzavod-solo`) with access granted to paying customers. Installed via a single `docker compose up -d` command.

---

## Channels

Telegram, VK, OK, Pinterest, WordPress, Facebook, Instagram (photos only).

Excluded: TikTok, YouTube, VK Video.

---

## Architecture

### Approach

Fork of the main repo with unused subsystems removed. No adapter layer — dead code is deleted outright.

### Removed Components

| Component | Files |
|---|---|
| AI agent | `manage/telegram/agentLoop.js`, `toolHandlers.js`, `tools.js`, `runner.js` |
| Docker isolation | `services/docker.service.js` |
| Session multi-user logic | `services/session.service.js` (replaced) |
| Video pipeline | `services/videoPipeline.service.js`, `services/content/videoPipeline.repository.js` |
| Removed channels | `services/tiktokMvp.service.js`, `services/youtubeMvp.service.js`, `services/vkVideoMvp.service.js` |
| MySQL / skills | `services/mysql/`, `skills.html`, skills routes |

### What Remains

- Content pipeline: `services/content/`, `services/contentMvp.service.js`
- 7 channel services: `telegramMvp`, `vkMvp`, `okMvp`, `pinterestMvp`, `wordpressMvp`, `facebookMvp`, `instagramMvp`
- CW Bot moderation (callbacks: `content:`, `vk_mod:`, `ok_mod:`, `ig_mod:`, `pin_mod:`, `wp_mod:`, `fb_mod:`)
- Auth Bot + web UI (`/auth.html`, `channels.html`, `content.html`, etc.)
- PostgreSQL: single fixed database `db_solo`

### Single-User Session

```
.env:  SINGLE_USER_MODE=true
       SINGLE_USER_CHAT_ID=100000
```

`session.service.js` always returns `100000`. Any other `chatId` is silently rejected. `manage/store.js` reads/writes a single `manage-state-100000.json` file.

### Scheduler Startup

In the main repo, per-channel schedulers start when a user session is created. In solo, they start once at server boot:

```js
// server.js
if (process.env.SINGLE_USER_MODE === 'true') {
  const chatId = process.env.SINGLE_USER_CHAT_ID;
  telegramMvp.startScheduler(chatId);
  vkMvp.startScheduler(chatId);
  okMvp.startScheduler(chatId);
  pinterestMvp.startScheduler(chatId);
  wordpressMvp.startScheduler(chatId);
  facebookMvp.startScheduler(chatId);
  instagramMvp.startScheduler(chatId);
}
```

---

## Data Flow

```
Scheduler (60s tick)
    ↓
reserveNextTopic(100000, channel)
    ↓
AI generates draft → status: draft
    ↓
[if premoderationEnabled]
CW Bot → ✅ approve / 🔁 regenerate / ❌ reject
    ↓
status: approved → queue → worker → publish
    ↓
updateTopicStatus(100000, topicId, 'completed')
```

### PostgreSQL

Both databases live in the same PostgreSQL container. `init-db/01_schema.sql` creates both:

- `clientzavod` — central tables: `content_queue`, `content_channels`, `content_analytics`, etc.
- `db_solo` — per-user tables: `content_jobs`, `content_posts`, `content_topics`, `publish_logs`, `content_config`, `vk_jobs`, `ok_jobs`, `pinterest_jobs`, `facebook_jobs`

All three `PG_HOST`, `PG_ADMIN_HOST`, `PG_SANDBOX_HOST` in `.env` point to the same container host (`db`). No dynamic provisioning.

---

## Installation

### Repository Structure

```
clientzavod-solo/
├── docker-compose.yml
├── .env.template
├── nginx/
│   └── solo.conf
└── init-db/
    └── 01_schema.sql       # all migrations merged into one file
```

### docker-compose.yml

```yaml
name: clientzavod-solo

services:
  app:
    image: ghcr.io/you/clientzavod-solo:latest
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/var/sandbox-data
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: db_solo
      POSTGRES_USER: ${PG_USER}
      POSTGRES_PASSWORD: ${PG_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init-db:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${PG_USER}"]
      interval: 5s
      retries: 10

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/solo.conf:/etc/nginx/conf.d/default.conf
      - ./certbot:/etc/letsencrypt
    depends_on: [app]

volumes:
  pgdata:
```

### Customer Install Steps

```bash
git clone https://github.com/you/clientzavod-solo /opt/clientzavod-solo
cd /opt/clientzavod-solo
cp .env.template .env
nano .env
docker compose up -d
```

### Updates

```bash
docker compose pull && docker compose up -d
```

---

## License Protection

### Primary: Private Repository

Access granted per customer via GitHub Collaborators or GitHub Teams. Revoke access on churn — customer cannot pull new images after revocation.

### Secondary: Hard User Limit in Code

```js
// services/session.service.js
async function createSession(chatId) {
  const fixedChatId = process.env.SINGLE_USER_CHAT_ID;
  if (String(chatId) !== String(fixedChatId)) {
    logger.warn(`Solo: rejected session for chatId ${chatId}`);
    return null;
  }
  return fixedChatId;
}
```

Only the `chatId` defined in `.env` can create a session. Prevents accidental or intentional multi-user use.

### Not Implemented

- Phone-home license checks (adds friction, raises customer concerns)
- Code obfuscation (private repo already solves the problem)
- License keys (redundant with private repo access control)

---

## Sync Strategy with Main Repo

Bug fixes in the content pipeline are cherry-picked from `docker-claw` to `clientzavod-solo` as needed:

```bash
# In clientzavod-solo
git remote add upstream https://github.com/you/docker-claw
git cherry-pick <commit-hash>
```

Agent-related commits are ignored. Channel-specific fixes are applied selectively.
