# clientzavod-solo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a single-user, agent-free fork of Docker-Claw in a separate GitHub repository `clientzavod-solo`, installable via `docker compose up -d`.

**Architecture:** Fork of docker-claw with the AI agent, Docker isolation layer, video pipeline, and three channels (TikTok, YouTube, VK Video) removed. A new `services/solo.bot.js` replaces `manage/telegram/runner.js` to manage a single fixed Telegram bot. All per-channel schedulers start at server boot using a fixed `SINGLE_USER_CHAT_ID` from `.env`.

**Tech Stack:** Node.js 18, Express.js, PostgreSQL 15, Telegraf, Docker Compose, nginx, GitHub Container Registry (ghcr.io).

---

## File Map

### New files
| File | Purpose |
|---|---|
| `services/solo.bot.js` | Single-user Telegram bot manager (replaces runner.js) |
| `tests/solo.session.test.js` | Tests for single-user session logic |
| `docker-compose.yml` | Solo deployment (app + db + nginx) |
| `Dockerfile` | Build image for ghcr.io |
| `.env.template` | Config template for customers |
| `nginx/solo.conf` | Reverse proxy config |
| `init-db/01_schema.sql` | Combined DB init (clientzavod + db_solo) |
| `.github/workflows/docker-publish.yml` | Build and push image to ghcr.io on push to main |

### Modified files
| File | Change |
|---|---|
| `config.js` | Add `isSingleUser`, `singleUserChatId` |
| `services/session.service.js` | Return fixed chatId, reject others |
| `server.js` | Remove runner/agent/video/unused-channel imports; start solo bot + schedulers |

### Deleted files
| Files |
|---|
| `manage/telegram/agentLoop.js`, `toolHandlers.js`, `tools.js` |
| `manage/telegram/runner.js` |
| `services/docker.service.js` |
| `services/videoPipeline.service.js` |
| `services/content/videoPipeline.repository.js` |
| `services/tiktokMvp.service.js` |
| `services/youtubeMvp.service.js` |
| `services/vkVideoMvp.service.js` |
| `services/mysql/` (entire directory) |
| `services/mysql.service.js` |
| `public/skills.html` |
| `routes/sandbox.routes.js` |
| `routes/execute.routes.js` |
| `routes/apps.routes.js` (if only used by agent) |

---

## Task 1: Create the clientzavod-solo repository

**Files:**
- Create: `/root/clientzavod-solo/` (new repo directory)

- [ ] **Step 1: Clone docker-claw into new directory**

```bash
git clone /root/docker-claw /root/clientzavod-solo
cd /root/clientzavod-solo
```

- [ ] **Step 2: Create private GitHub repository via gh CLI**

```bash
gh repo create clientzavod-solo --private --description "Clientzavod Solo — single-user self-hosted edition"
```

Expected: Repository created at `https://github.com/<owner>/clientzavod-solo`

- [ ] **Step 3: Set remote and push initial state**

```bash
git remote remove origin
git remote add origin https://github.com/<owner>/clientzavod-solo.git
git push -u origin main
```

Expected: Initial push with full docker-claw history.

- [ ] **Step 4: Verify remote**

```bash
git remote -v
```

Expected: `origin  https://github.com/<owner>/clientzavod-solo.git (fetch/push)`

---

## Task 2: Add SINGLE_USER_MODE to config.js

**Files:**
- Modify: `config.js`

- [ ] **Step 1: Open config.js and find the exports block**

```bash
grep -n "module.exports" config.js | head -5
```

Note the line number of `module.exports = {`.

- [ ] **Step 2: Add solo config fields**

In `config.js`, inside `module.exports = { ... }`, add after the last existing field:

```js
  isSingleUser: process.env.SINGLE_USER_MODE === 'true',
  singleUserChatId: process.env.SINGLE_USER_CHAT_ID || '100000',
```

- [ ] **Step 3: Verify config loads**

```bash
node -e "const c = require('./config'); console.log('isSingleUser:', c.isSingleUser, 'chatId:', c.singleUserChatId)"
```

Expected output (without .env set): `isSingleUser: false chatId: 100000`

- [ ] **Step 4: Commit**

```bash
git add config.js
git commit -m "feat: add SINGLE_USER_MODE to config"
```

---

## Task 3: Rewrite session.service.js + write tests

**Files:**
- Modify: `services/session.service.js`
- Create: `tests/solo.session.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/solo.session.test.js`:

```js
process.env.SINGLE_USER_MODE = 'true';
process.env.SINGLE_USER_CHAT_ID = '100000';

const assert = require('assert');

// Re-require config after env set
delete require.cache[require.resolve('../config')];
delete require.cache[require.resolve('../services/session.service')];

const sessionService = require('../services/session.service');

async function run() {
  // Allowed chatId creates session
  const s1 = await sessionService.getOrCreateSession('100000');
  assert.ok(s1, 'should return session for fixed chatId');
  assert.strictEqual(String(s1.chatId), '100000', 'chatId should be 100000');

  // Wrong chatId is rejected
  const s2 = await sessionService.getOrCreateSession('999999');
  assert.strictEqual(s2, null, 'should reject unknown chatId in solo mode');

  console.log('All solo session tests passed');
}

run().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node tests/solo.session.test.js
```

Expected: Error — `getOrCreateSession` not defined or wrong behavior.

- [ ] **Step 3: Read current session.service.js to understand its structure**

```bash
head -60 services/session.service.js
```

Note the shape of the session object and what `getOrCreateSession` returns (or what the equivalent function is).

- [ ] **Step 4: Add single-user guard to session.service.js**

Find the main session creation function (likely `getOrCreateSession`, `createSession`, or `recoverSession`). Add a guard at the top of each public session-creation function:

```js
const config = require('../config');

// At the top of getOrCreateSession (or equivalent):
if (config.isSingleUser) {
  if (String(chatId) !== String(config.singleUserChatId)) {
    const logger = require('../utils/logger') || console;
    (logger.warn || logger.log)(`Solo: rejected session for chatId ${chatId}`);
    return null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node tests/solo.session.test.js
```

Expected: `All solo session tests passed`

- [ ] **Step 6: Commit**

```bash
git add services/session.service.js tests/solo.session.test.js
git commit -m "feat: single-user session guard"
```

---

## Task 4: Create services/solo.bot.js (replaces runner.js)

**Files:**
- Create: `services/solo.bot.js`

This module creates one Telegraf bot for the fixed chatId and exposes a `bots` Map that the schedulers consume via `() => soloBotService.bots`.

- [ ] **Step 1: Check how runner.js creates a bot to understand the bot entry shape**

```bash
grep -n "bots.set\|bot.*token\|new Telegraf" manage/telegram/runner.js | head -20
```

Note the shape of entries in the `bots` Map (e.g., `{ bot, token, chatId }`).

- [ ] **Step 2: Create services/solo.bot.js**

```js
const { Telegraf } = require('telegraf');
const config = require('../config');

const bots = new Map();

async function startBot() {
  const token = process.env.USER_BOT_TOKEN;
  if (!token) {
    console.warn('Solo: USER_BOT_TOKEN not set — Telegram channel disabled');
    return;
  }

  const chatId = config.singleUserChatId;
  const bot = new Telegraf(token);

  // Start bot in long-polling mode
  bot.launch().catch(err => console.error('Solo bot launch error:', err));

  bots.set(String(chatId), { bot, token, chatId: String(chatId) });
  console.log(`Solo bot started for chatId ${chatId}`);
}

async function stopBot() {
  for (const [, entry] of bots) {
    try { entry.bot.stop(); } catch (_) {}
  }
  bots.clear();
}

module.exports = { bots, startBot, stopBot };
```

- [ ] **Step 3: Verify syntax**

```bash
node -e "require('./services/solo.bot')"
```

Expected: No errors (module loads cleanly; bot doesn't start without token).

- [ ] **Step 4: Commit**

```bash
git add services/solo.bot.js
git commit -m "feat: add solo.bot.js single-user bot manager"
```

---

## Task 5: Remove AI agent subsystem

**Files:**
- Delete: `manage/telegram/agentLoop.js`, `manage/telegram/toolHandlers.js`, `manage/telegram/tools.js`
- Delete: `manage/telegram/runner.js`

- [ ] **Step 1: Verify no other files depend on agentLoop outside of runner.js**

```bash
grep -r "agentLoop\|toolHandlers\|tools\.js" --include="*.js" -l | grep -v "manage/telegram/"
```

Expected: No results (only runner.js imports these, which we're also removing).

- [ ] **Step 2: Delete agent files**

```bash
rm manage/telegram/agentLoop.js
rm manage/telegram/toolHandlers.js
rm manage/telegram/tools.js
rm manage/telegram/runner.js
```

- [ ] **Step 3: Verify deletion**

```bash
ls manage/telegram/
```

Expected: These four files are absent.

- [ ] **Step 4: Commit**

```bash
git add -A manage/telegram/
git commit -m "chore: remove AI agent subsystem"
```

---

## Task 6: Remove Docker service

**Files:**
- Delete: `services/docker.service.js`

- [ ] **Step 1: Find all imports of docker.service**

```bash
grep -rn "require.*docker\.service" --include="*.js"
```

Note each file and line number.

- [ ] **Step 2: Remove docker.service.js**

```bash
rm services/docker.service.js
```

- [ ] **Step 3: Remove all imports and call sites found in Step 1**

For each file found, remove the `require('./docker.service')` line and any calls to `dockerService.*`. If a function only wrapped a docker call (e.g., `ensureContainer`), replace its body with a no-op that logs a warning and returns a success-shaped value, or simply delete the call site.

Example — in `services/session.service.js` if there's a `dockerService.createContainer(chatId)` call:
```js
// Remove or replace with:
// Solo mode: no container needed
```

- [ ] **Step 4: Verify server starts without errors**

```bash
node -e "require('./server')" 2>&1 | head -20
```

Expected: No "Cannot find module" errors for docker.service.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove Docker service"
```

---

## Task 7: Remove video pipeline

**Files:**
- Delete: `services/videoPipeline.service.js`
- Delete: `services/content/videoPipeline.repository.js`
- Delete: `services/content/video.service.js` (KIE.ai video generation)
- Delete: `services/content/kieUsage.repository.js` (KIE.ai usage tracking)
- Delete: `routes/video.routes.js`

- [ ] **Step 1: Find all imports of video pipeline files**

```bash
grep -rn "videoPipeline\|video\.service\|video\.routes" --include="*.js" -l
```

- [ ] **Step 2: Delete video pipeline files**

```bash
rm services/videoPipeline.service.js
rm services/content/videoPipeline.repository.js
rm services/content/video.service.js
rm routes/video.routes.js
```

- [ ] **Step 3: Remove references in server.js**

In `server.js`, remove:
- The `require('./services/videoPipeline.service')` block (around line 111)
- The `require('./routes/video.routes')` and `app.use('/api/video', videoRoutes)` line
- The `videoPipeline.service.stopCleanupScheduler()` in the shutdown handler

- [ ] **Step 4: Remove references in instagramMvp.service.js**

```bash
grep -n "videoPipeline\|video\.service\|isVideo" services/instagramMvp.service.js | head -20
```

Remove or stub out any calls to `videoPipeline` or `isVideo: true` draft logic. Instagram in solo mode only handles photos — remove the Reels video path entirely.

- [ ] **Step 5: Verify**

```bash
node -e "require('./services/instagramMvp.service')" 2>&1 | head -10
```

Expected: No "Cannot find module" errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove video pipeline"
```

---

## Task 8: Remove unused channels (TikTok, YouTube, VK Video)

**Files:**
- Delete: `services/tiktokMvp.service.js`, `services/youtubeMvp.service.js`, `services/vkVideoMvp.service.js`
- Delete: `services/content/youtube.repository.js`

- [ ] **Step 1: Find all imports**

```bash
grep -rn "tiktokMvp\|youtubeMvp\|vkVideoMvp\|youtube\.repository" --include="*.js" -l
```

- [ ] **Step 2: Delete service files**

```bash
rm services/tiktokMvp.service.js
rm services/youtubeMvp.service.js
rm services/vkVideoMvp.service.js
rm services/content/youtube.repository.js
```

- [ ] **Step 3: Remove from server.js**

In `server.js`, remove:
- `const youtubeMvpService = require('./services/youtubeMvp.service')` (lines ~460 and ~724)
- `const vkVideoMvpService = require('./services/vkVideoMvp.service')` (line ~734)
- `tiktokMvpService.startScheduler(...)` block
- `youtubeMvpService.startScheduler(...)` block
- `vkVideoMvpService.startScheduler(...)` block
- Their `stopScheduler()` calls in shutdown handler

- [ ] **Step 4: Remove from contentMvp.service.js if referenced**

```bash
grep -n "tiktok\|youtube\|vkVideo\|vk_video" services/contentMvp.service.js | head -20
```

Remove or guard with `if (false)` any logic that enqueues or handles these three channels.

- [ ] **Step 5: Verify**

```bash
node -e "require('./services/contentMvp.service')" 2>&1 | head -10
```

Expected: No "Cannot find module" errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove TikTok, YouTube, VK Video channels"
```

---

## Task 9: Remove MySQL/skills subsystem

**Files:**
- Delete: `services/mysql/` (entire directory)
- Delete: `services/mysql.service.js` (if exists as top-level)
- Delete: `public/skills.html`
- Remove skills routes from router

- [ ] **Step 1: Find all MySQL/skills imports**

```bash
grep -rn "mysql\|ai_skills\|skills" --include="*.js" -l | grep -v node_modules | grep -v test
```

- [ ] **Step 2: Delete files**

```bash
rm -rf services/mysql/
rm -f public/skills.html
```

- [ ] **Step 3: Remove MySQL init from server.js**

In `server.js`, remove the `require('./services/mysql.service')` block (around line 123).

- [ ] **Step 4: Remove skills routes**

```bash
grep -n "skills" routes/index.js
```

Remove the skills route registration line(s) found.

- [ ] **Step 5: Verify**

```bash
node -e "require('./routes')" 2>&1 | head -10
```

Expected: No "Cannot find module" errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove MySQL and skills subsystem"
```

---

## Task 10: Rewrite server.js for solo startup

**Files:**
- Modify: `server.js`

The goal: replace `telegramRunner` with `soloBotService`, remove all deleted module imports, start 7 channel schedulers at boot.

- [ ] **Step 1: Remove deleted imports from top of server.js**

Remove these require lines:
```js
// DELETE these:
const youtubeMvpService = require('./services/youtubeMvp.service');
const vkVideoMvpService = require('./services/vkVideoMvp.service');
// (tiktok is lazy-required inline — remove that block too)
```

- [ ] **Step 2: Add soloBotService import near top of server.js**

After the existing `require` statements at the top:
```js
const soloBotService = require('./services/solo.bot');
```

- [ ] **Step 3: Replace telegramRunner.startAllBots with soloBotService.startBot**

Find the block:
```js
const telegramRunner = require('./manage/telegram/runner');
await telegramRunner.startAllBots(cwBot);
```

Replace with:
```js
await soloBotService.startBot();
```

- [ ] **Step 4: Replace scheduler getter references**

Find all `startScheduler(() => telegramRunner.bots)` calls and replace with `startScheduler(() => soloBotService.bots)`:

```js
telegramMvpService.startScheduler(() => soloBotService.bots);
pinterestMvpService.startScheduler(() => soloBotService.bots);
vkMvpService.startScheduler(() => soloBotService.bots);
okMvpService.startScheduler(() => soloBotService.bots);
instagramMvpService.startScheduler(() => soloBotService.bots);
facebookMvpService.startScheduler(() => soloBotService.bots);
// WordPress uses initWorkerHandlers instead of startScheduler:
wordpressMvpService.initWorkerHandlers();
```

- [ ] **Step 5: Remove TikTok/YouTube/VK Video scheduler blocks**

Delete these blocks entirely from server.js:
```js
// DELETE:
const tiktokMvpService = require('./services/tiktokMvp.service');
tiktokMvpService.startScheduler(...);

youtubeMvpService.startScheduler(...);
vkVideoMvpService.startScheduler(...);
```

- [ ] **Step 6: Update shutdown handler**

In the graceful shutdown section, replace `telegramRunner` stop with:
```js
await soloBotService.stopBot();
```

Remove `youtubeMvpService.stopScheduler()`, `tiktokMvpService.stopScheduler()`, `vkVideoMvpService.stopScheduler()`, `videoPipeline.stopCleanupScheduler()`.

- [ ] **Step 7: Verify server loads**

```bash
node -e "require('./server')" 2>&1 | head -30
```

Expected: No "Cannot find module" errors. May show DB connection errors (normal without DB running).

- [ ] **Step 8: Commit**

```bash
git add server.js
git commit -m "feat: wire solo.bot.js into server startup"
```

---

## Task 11: Create database initialization script

**Files:**
- Create: `init-db/01_schema.sql`

This script runs once when the PostgreSQL container starts for the first time. It creates both `clientzavod` (central tables) and populates `db_solo` (per-user tables — already created by `POSTGRES_DB=db_solo`).

- [ ] **Step 1: Examine the central schema**

```bash
wc -l content_schema.sql migrations/*.sql
```

Note which SQL files cover central tables vs per-user tables.

- [ ] **Step 2: Examine per-user table definitions in create-user-db.js**

```bash
grep -A 20 "CREATE TABLE" create-user-db.js
```

Copy all `CREATE TABLE IF NOT EXISTS` statements for the per-user tables.

- [ ] **Step 3: Create init-db/ directory and script**

```bash
mkdir -p init-db
```

Create `init-db/01_schema.sql` with this structure:

```sql
-- =====================================================
-- clientzavod-solo: database initialization
-- Runs once on first container start
-- =====================================================

-- Create central database (db_solo is already created by POSTGRES_DB env)
CREATE DATABASE clientzavod;

-- =====================================================
-- Central database: clientzavod
-- =====================================================
\c clientzavod;

-- [Paste full contents of content_schema.sql here]
-- [Paste relevant migration SQL from migrations/*.sql]

-- =====================================================
-- Per-user database: db_solo
-- =====================================================
\c db_solo;

-- [Paste CREATE TABLE IF NOT EXISTS statements from create-user-db.js]
-- Include: content_job_queue, content_jobs, content_posts, content_topics,
--          publish_logs, content_config, vk_jobs, ok_jobs, pinterest_jobs,
--          facebook_jobs, content_knowledge_base
```

Replace placeholders with the actual SQL gathered in Steps 1 and 2.

- [ ] **Step 4: Verify SQL syntax**

```bash
psql --version
psql -U postgres -f init-db/01_schema.sql --dry-run 2>&1 | head -20
```

If `--dry-run` not available, check for syntax errors:
```bash
psql -U postgres -c "\i init-db/01_schema.sql" 2>&1 | grep -i error | head -10
```

- [ ] **Step 5: Commit**

```bash
git add init-db/
git commit -m "feat: add database initialization script"
```

---

## Task 12: Create Docker infrastructure

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `nginx/solo.conf`
- Create: `.github/workflows/docker-publish.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3015

CMD ["node", "server.js"]
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
name: clientzavod-solo

services:
  app:
    image: ghcr.io/OWNER/clientzavod-solo:latest
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/var/sandbox-data
    depends_on:
      db:
        condition: service_healthy
    networks:
      - internal

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
      timeout: 5s
      retries: 10
    networks:
      - internal

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/solo.conf:/etc/nginx/conf.d/default.conf:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - app
    networks:
      - internal

networks:
  internal:

volumes:
  pgdata:
```

Replace `OWNER` with your actual GitHub username/org.

- [ ] **Step 3: Create nginx/solo.conf**

```bash
mkdir -p nginx
```

```nginx
server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://app:3015;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }
}
```

- [ ] **Step 4: Create .github/workflows/docker-publish.yml**

```bash
mkdir -p .github/workflows
```

```yaml
name: Publish Docker image

on:
  push:
    branches: [main]

jobs:
  push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:latest
```

- [ ] **Step 5: Verify docker-compose syntax**

```bash
docker compose config --quiet 2>&1
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml nginx/ .github/
git commit -m "feat: add Docker Compose deployment infrastructure"
```

---

## Task 13: Create .env.template

**Files:**
- Create: `.env.template`

- [ ] **Step 1: List all process.env references in the codebase**

```bash
grep -rh "process\.env\." --include="*.js" | grep -oP "process\.env\.\K[A-Z_]+" | sort -u
```

Use this list to populate the template.

- [ ] **Step 2: Create .env.template**

```env
# ============================================================
# clientzavod-solo — Configuration Template
# Copy to .env and fill in your values
# ============================================================

# --- Single-user mode (do not change) ---
SINGLE_USER_MODE=true
SINGLE_USER_CHAT_ID=100000

# --- Server ---
PORT=3015
NODE_ENV=production
SESSION_SECRET=change-me-to-a-random-string

# --- Telegram bots ---
AUTH_BOT_TOKEN=         # Auth bot token from @BotFather
CW_BOT_TOKEN=           # Moderator bot token from @BotFather
USER_BOT_TOKEN=         # Your personal Telegram bot token

# --- Moderator Telegram ID ---
CW_MODERATOR_USER_ID=   # Your Telegram user ID (number)

# --- PostgreSQL ---
PG_HOST=db
PG_ADMIN_HOST=db
PG_SANDBOX_HOST=db
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=change-me-strong-password
PG_DATABASE=clientzavod

# --- AI (for content generation) ---
AI_API_KEY=             # ProTalk or OpenRouter API key
AI_MODEL=               # e.g. openai/gpt-4o-mini

# --- Channels (fill in only the ones you use) ---

# VK
VK_TOKEN=
VK_GROUP_ID=

# OK (Odnoklassniki)
OK_TOKEN=
OK_GROUP_ID=

# Pinterest
PINTEREST_TOKEN=
PINTEREST_BOARD_ID=

# WordPress
WP_URL=
WP_USER=
WP_PASSWORD=

# Facebook
FB_TOKEN=
FB_PAGE_ID=

# Instagram (via Buffer)
BUFFER_API_KEY=

# --- Data storage ---
DATA_ROOT=/var/sandbox-data
```

- [ ] **Step 3: Ensure .env is in .gitignore**

```bash
grep "^\.env$" .gitignore || echo ".env" >> .gitignore
```

- [ ] **Step 4: Commit**

```bash
git add .env.template .gitignore
git commit -m "feat: add .env.template for customer setup"
```

---

## Task 14: Final verification

- [ ] **Step 1: Run all existing tests**

```bash
npm test 2>&1
```

Note any failures. Fix if related to removed modules (update imports or skip tests for removed channels).

- [ ] **Step 2: Run solo session test**

```bash
node tests/solo.session.test.js
```

Expected: `All solo session tests passed`

- [ ] **Step 3: Verify no broken requires**

```bash
node -e "
  require('./config');
  require('./services/session.service');
  require('./services/solo.bot');
  require('./services/telegramMvp.service');
  require('./services/vkMvp.service');
  require('./services/okMvp.service');
  require('./services/pinterestMvp.service');
  require('./services/facebookMvp.service');
  require('./services/instagramMvp.service');
  require('./services/wordpressMvp.service');
  require('./routes');
  console.log('All modules load OK');
" 2>&1
```

Expected: `All modules load OK`

- [ ] **Step 4: Build Docker image locally**

```bash
docker build -t clientzavod-solo:test .
```

Expected: Build completes without errors.

- [ ] **Step 5: Test docker compose starts cleanly**

```bash
cp .env.template .env
# Fill in minimal values: PG_USER=postgres PG_PASSWORD=testpass SINGLE_USER_MODE=true
docker compose up -d db
sleep 5
docker compose logs db | tail -10
```

Expected: `database system is ready to accept connections`

- [ ] **Step 6: Final commit and tag**

```bash
git add -A
git commit -m "chore: final cleanup and verification" --allow-empty
git tag v1.0.0
git push origin main --tags
```

- [ ] **Step 7: Push triggers GitHub Actions build**

```bash
gh run list --limit 3
```

Expected: A `Publish Docker image` run in progress or completed successfully.
