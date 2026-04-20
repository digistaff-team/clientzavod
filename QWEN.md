# Клиент Завод (Docker-Claw) — Project Context

## Project Overview

**Клиент Завод** (Client Factory) is a multi-tenant SaaS platform that provides isolated Docker containers for each user, managed through a web interface, Telegram bots, Email, or HTTP webhooks. The platform features an AI agent that autonomously executes commands, reads context, and provides meaningful responses.

### Core Capabilities

- **Per-user isolated sandbox** — Each user gets a separate Docker container with CPU and memory limits
- **AI agent in the loop** — Agent decides which commands to run, checks results, and forms responses (30+ tools available)
- **Multi-channel management** — Telegram bot, Email (IMAP/SMTP), HTTP webhooks
- **Multi-platform publishing** — Publish content to Telegram, VK, OK (Odnoklassniki), Instagram, Pinterest, YouTube Shorts, Facebook
- **WordPress/Дзен publishing** — Generate and publish blog articles to WordPress sites and Yandex Zen with AI-powered content generation, SEO optimization, and image cover generation
- **Central moderation system** — Single moderation bot (CW_BOT) handles approval workflows for all platforms (Telegram, VK, OK, Instagram, YouTube, Pinterest, Facebook)
- **Web interface** — Dashboard for sessions, files, tasks, apps, channels, skills, balance, and AI settings
- **Persistent storage** — Data survives restarts via bind-mount and per-user PostgreSQL
- **Snapshots** — Multi-level undo for files, old snapshots auto-cleaned
- **Auto-backup & restore** — Periodic backups with configurable retention
- **Personalization** — AI personality and user context stored in `IDENTITY.md`, `SOUL.md`, `USER.md`, `MEMORY.md`
- **Project cache** — Persistent file tree map for fast AI context building
- **Content scheduler** — Generate and publish posts (text + image/video) to multiple social platforms on schedule
- **Token billing** — Monthly token-based billing system with balance tracking and plan management
- **Admin panel** — `/admin` zone for managing all containers: start, stop, restart, delete, logs, direct command execution, chat, skills
- **Telegram authorization** — Central auth bot (@clientzavod_bot) for user login via Telegram ID
- **CI/CD** — GitHub Actions workflow for automated deployment
- **E2E Testing** — Playwright test suite for critical user journeys

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 18+ |
| **Framework** | Express.js |
| **Database** | PostgreSQL 15 (per-user DBs + central `clientzavod`) |
| **MySQL** | MySQL 8 (skills database `ai_skills_db`) |
| **Containerization** | Docker (dynamic container creation per user) |
| **Bot Framework** | Telegraf (Telegram) |
| **Email** | imapflow, nodemailer, mailparser |
| **AI Integration** | ProTalk router, OpenAI, OpenRouter |
| **Image Generation** | Kie.ai API, OpenAI Images (fallback) |
| **Video Generation** | RunwayML, Pika, Kie.ai (optional) |
| **Social Media** | VK API, OK API, Instagram API, Pinterest API, YouTube API, Facebook Graph API, Buffer.com GraphQL API |
| **Blog Publishing** | WordPress REST API v2 (Application Passwords), Yandex Zen |
| **Session Management** | express-session + FileStore |
| **Image Processing** | Sharp |
| **Testing** | Playwright (E2E), Jest-compatible (unit) |
| **CI/CD** | GitHub Actions |
| **Reverse Proxy** | Nginx + Certbot (Let's Encrypt SSL) |

## Project Structure

```
/root/docker-claw/
├── server.js                  # Main entry point
├── config.js                  # Centralized configuration
├── package.json               # Dependencies and scripts
├── docker-compose.yml         # Docker Compose configuration (5 services)
├── Dockerfile                 # Production Docker image
├── .env.example               # Environment variables template (200+ lines)
│
├── routes/                    # Express route handlers
│   ├── index.js               # Main route aggregator
│   ├── admin.routes.js        # Admin panel APIs
│   ├── apps.routes.js         # App management
│   ├── auth.routes.js         # Authentication (Telegram login)
│   ├── billing.routes.js      # Token billing & payments
│   ├── content.routes.js      # Content generation & publishing
│   ├── database.routes.js     # Per-user DB management
│   ├── execute.routes.js      # Command execution
│   ├── files.routes.js        # File operations
│   ├── plans.routes.js        # Task plans
│   ├── sandbox.routes.js      # Sandbox proxy endpoints
│   ├── session.routes.js      # Session management
│   ├── user_hooks.routes.js   # User webhooks
│   └── webhook.routes.js      # Incoming webhooks
│
├── services/                  # Business logic layer
│   ├── ai_router_service.js   # LLM routing (ProTalk/OpenAI/OpenRouter)
│   ├── balance.service.js     # Balance checking & token management
│   ├── blogGenerator.service.js # Blog article generation (WordPress/Дзен)
│   ├── buffer.service.js      # Buffer.com GraphQL API (Pinterest, IG, YouTube, Facebook)
│   ├── contentMvp.service.js  # Content generation & publishing (Telegram)
│   ├── deps.service.js        # Dependency graph
│   ├── docker.service.js      # Container lifecycle management
│   ├── facebookMvp.service.js # Facebook content pipeline with moderation
│   ├── image.service.js       # Image processing (watermarks, etc.)
│   ├── imageGen.service.js    # Image generation (Kie.ai + OpenAI fallback)
│   ├── instagramMvp.service.js # Instagram content pipeline (via Buffer API)
│   ├── mysql.service.js       # MySQL skills DB connection
│   ├── okMvp.service.js       # OK content pipeline
│   ├── pinterestMvp.service.js # Pinterest content pipeline
│   ├── plan.service.js        # Task plans
│   ├── postgres.service.js    # Per-user PostgreSQL provisioning
│   ├── projectCache.service.js # Project file tree cache
│   ├── session.service.js     # Session management
│   ├── snapshot.service.js    # File snapshots (undo)
│   ├── storage.service.js     # File storage & backups
│   ├── vkMvp.service.js       # VK content pipeline
│   ├── wordpressMvp.service.js # WordPress publishing service
│   ├── youtubeMvp.service.js  # YouTube Shorts content pipelines
│   │
│   └── content/               # Shared content pipeline modules
│       ├── index.js           # Content module index
│       ├── repository.js      # Main content repository
│       ├── queue.repository.js # Queue repository
│       ├── status.js          # Content status tracking
│       ├── validators.js      # Content validators
│       ├── limits.js          # Content limits
│       ├── worker.js          # Content worker
│       ├── alerts.js          # Content alerts
│       ├── video.service.js   # Video generation service
│       ├── videoPipeline.repository.js # Video pipeline repository
│       ├── instagram.repository.js # Instagram DB repository
│       ├── ok.repository.js   # OK DB repository
│       ├── pinterest.repository.js # Pinterest DB repository
│       ├── vk.repository.js   # VK DB repository
│       ├── wordpress.repository.js # WordPress DB repository
│       ├── youtube.repository.js # YouTube DB repository
│       └── facebook.repository.js # Facebook DB repository
│
├── manage/                    # Channel integrations & AI agent
│   ├── telegram/              # Telegram bot implementation
│   │   ├── runner.js          # Bot polling & command handlers
│   │   ├── agentLoop.js       # AI agent execution loop
│   │   ├── toolHandlers.js    # Tool call implementations
│   │   ├── tools.js           # Tool definitions (30+ tools)
│   │   ├── authBot.js         # Central auth bot (@clientzavod_bot)
│   │   └── context.js         # Telegram context
│   ├── email/                 # Email integration
│   │   ├── processor.js       # IMAP polling & SMTP sending
│   │   └── ...
│   ├── agentQueue.js          # Per-user agent queue
│   ├── billingScheduler.js    # Monthly token reset scheduler
│   ├── context.js             # Context builder for AI
│   ├── prompts.js             # System prompts
│   ├── routes.js              # /api/manage endpoints
│   ├── store.js               # Persistent channel state
│   ├── tokenBilling.js        # Token billing system
│   └── README.md              # Manage module documentation
│
├── public/                    # Web interface (HTML + JS + CSS)
│   ├── admin/                 # Admin panel pages
│   │   ├── chat.html          # Admin chat interface
│   │   ├── container-manage.html # Container management
│   │   ├── containers.html    # Container list
│   │   ├── login.html         # Admin login
│   │   └── skills.html        # Skills management
│   ├── css/                   # Stylesheets
│   │   └── main.css
│   ├── js/                    # Frontend JavaScript
│   │   ├── ai.js              # AI settings frontend
│   │   ├── apps.js            # App registry frontend
│   │   ├── channels.js        # Channels frontend
│   │   ├── common.js          # Common utilities
│   │   ├── console.js         # Console frontend
│   │   ├── content.js         # Content frontend
│   │   ├── files.js           # File manager frontend
│   │   ├── info.js            # Info page frontend
│   │   ├── personalization.js # Personalization frontend
│   │   ├── setup.js           # Setup wizard frontend
│   │   ├── skills.js          # Skills frontend
│   │   └── tasks.js           # Tasks frontend
│   ├── auth.html              # Login page
│   ├── balance.html           # Token balance page
│   ├── channels.html          # Channel configuration
│   ├── content.html           # Content scheduler
│   ├── ai.html                # AI settings
│   ├── apps.html              # App registry
│   ├── console.html           # Web console
│   ├── files.html             # File manager
│   ├── index.html             # Dashboard
│   ├── info.html              # System info
│   ├── setup.html             # Setup wizard
│   ├── skills.html            # Skills page
│   └── tasks.html             # Task management
│
├── migrations/                # Database migration scripts
│   ├── 001_add_billing_tables.sql     # Billing tables
│   ├── 20260325_add_vk_integration.sql # VK integration
│   └── 20260406_add_facebook_integration.sql # Facebook integration
│
├── tests/                     # Test files
│   ├── content.status.test.js       # Content status tests
│   ├── validators.extended.test.js  # Extended validators tests
│   ├── wordpress.publisher.test.js  # WordPress publisher tests
│   ├── blog.generator.test.js       # Blog generation tests
│   ├── blog.moderation.test.js      # Blog moderation tests
│   ├── vk.moderation.test.js        # VK moderation tests
│   ├── vk.publisher.test.js         # VK publisher tests
│   ├── youtube.mvp.test.js          # YouTube MVP tests
│   ├── video.pipeline.test.js       # Video pipeline tests
│   ├── check-ai-config.js           # AI config checker
│   ├── check-queue.js               # Queue checker
│   ├── test-openrouter.py           # OpenRouter test (Python)
│   │
│   └── e2e/                   # Playwright E2E tests
│       ├── fixtures/
│       │   ├── constants.js
│       │   └── testData.js
│       ├── helpers/
│       │   ├── api.js
│       │   ├── auth.js
│       │   ├── channels.js
│       │   └── setup.js
│       ├── specs/
│       │   ├── 0-critical-path.spec.js
│       │   ├── 1-onboarding.spec.js
│       │   ├── 2-channels.spec.js
│       │   └── 3-content-flow.spec.js
│       └── playwright.config.js
│
├── nginx/                     # Nginx + Certbot configuration
│   ├── conf.d/default.conf    # Nginx reverse proxy config
│   └── certbot/               # Let's Encrypt SSL certificates
│
├── .github/workflows/         # GitHub Actions CI/CD
│   └── deploy.yml             # Deployment workflow
│
├── ROLE.md                    # AI agent role specification
├── TASKS_BILLING.md           # Token billing system specification (891 lines)
├── MYSQL_MIGRATION.md         # MySQL migration guide
├── README.md                  # Main project documentation (380 lines)
├── PROCESSES.md               # Processes documentation (placeholder)
├── content_schema.sql         # Content database schema
├── ai_skills_backup.sql       # AI skills database backup
└── cleanup_backups.sh         # Backup cleanup script
```

## Building and Running

### Prerequisites

- Linux server (Ubuntu 20.04+)
- Docker Engine (not Docker Desktop)
- Node.js 18+ and npm
- PostgreSQL 14+

### Installation

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# 2. Install PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

# 3. Clone and install dependencies
git clone https://github.com/atiksorg/docker-claw.git
cd docker-claw
npm install

# 4. Create .env from .env.example
cp .env.example .env
# Edit .env with your values

# 5. Create storage directories
sudo mkdir -p /var/sandbox-data /var/sandbox-backups /var/sandbox-snapshots
sudo chown -R $USER:$USER /var/sandbox-data /var/sandbox-backups /var/sandbox-snapshots
```

### Running

```bash
# Development (auto-reload)
npm run dev

# Production
npm start

# Via systemd (recommended for production)
sudo systemctl enable --now docker-claw
```

Server runs on `http://localhost:3015` by default.

### Docker Compose (Optional)

```bash
# Start all services (PostgreSQL, MySQL, Nginx, Certbot, app)
docker-compose up -d
```

**Docker Compose Services:**
1. **postgres** — PostgreSQL 15
2. **mysql** — MySQL 8.0 (skills DB)
3. **nginx** — Nginx (Alpine, reverse proxy)
4. **certbot** — Let's Encrypt SSL renewal
5. **app** — Main Node.js application

## Key Configuration Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3015` | HTTP server port |
| `APP_URL` | — | Application URL (for webhooks) |
| `API_URL` | — | API URL (for frontend) |
| `PG_HOST` | `172.17.0.1` | PostgreSQL host |
| `PG_ADMIN_HOST` | `PG_HOST` | PostgreSQL host for admin operations |
| `PG_SANDBOX_HOST` | `PG_HOST` | PostgreSQL host passed to sandbox containers |
| `PG_PASSWORD` | — | PostgreSQL password |
| `DATA_ROOT` | `/var/sandbox-data` | User data storage root |
| `DOCKER_IMAGE` | `sandbox-python:latest` | Sandbox container image |
| `CONTAINER_MEMORY` | `256m` | Memory limit per user container |
| `CONTAINER_CPUS` | `2.0` | CPU limit per user container |
| `CONTAINER_TIMEOUT` | — | Command execution timeout |
| `KIE_API_KEY` | — | Kie.ai API key for image generation |
| `OPENAI_API_KEY` | — | OpenAI API key (fallback for images, AI) |
| `BOT_TOKEN` | — | Telegram bot token (user bot) |
| `AUTH_BOT_TOKEN` | — | Telegram auth bot token (@clientzavod_bot) |
| `CONTENT_MVP_TIME` | `09:00` | Scheduled content publish time |
| `CONTENT_MVP_TZ` | `Europe/Moscow` | Timezone for scheduler |
| `CHANNEL_ID` | — | Telegram channel ID for publishing |
| `CONTENT_MVP_MODERATOR_USER_ID` | — | Telegram user ID for content moderation |
| `CONTENT_MVP_DAILY_LIMIT` | `1` | Daily content generation limit |
| `CONTENT_MVP_CONTENT_TYPE` | `text+image` | Content type: text+image or text+video |
| `CW_BOT_TOKEN` | — | Central moderation bot token |
| `CW_BOT_USERNAME` | — | Central moderation bot username |
| `CW_BOT_WEBHOOK_URL` | — | Central bot webhook URL |
| `VIDEO_MODEL` | `veo3_fast` | Default video generation model |
| `VIDEO_TIMEOUT_SEC` | `300` | Video generation timeout |
| `VIDEO_FALLBACK_ENABLED` | `true` | Fallback to image on video failure |
| `VK_*` | — | VK API credentials |
| `OK_*` | — | OK API credentials |
| `FACEBOOK_DAILY_LIMIT` | `10` | Daily Facebook post limit |
| `FACEBOOK_MODERATION_TIMEOUT_HOURS` | `24` | Facebook moderation timeout |
| `ADMIN_PASSWORD` | — | Admin panel password |
| `BACKUP_ROOT` | `/var/sandbox-backups` | Backup storage root |
| `SNAPSHOT_ROOT` | `/var/sandbox-snapshots` | Snapshot storage root |
| `MYSQL_SKILLS_*` | — | MySQL skills database credentials |
| `WEBHOOK_URL` | — | Telegram bot webhook URL (optional) |

## API Endpoints

All routes prefixed with `/api`.

| Route | Description |
|-------|-------------|
| `GET /api/health` | Health check, active session count |
| `/api/session/*` | Create/get/delete sessions |
| `/api/execute/*` | Execute commands in container |
| `/api/files/*` | Upload/download/list files |
| `/api/database/*` | Per-user PostgreSQL management |
| `/api/manage/*` | Channel (Telegram/Email/Facebook/WordPress) & AI settings |
| `/api/content/*` | Content generation & publishing |
| `/api/plans/*` | Task plan management |
| `/api/apps/*` | App registry |
| `/api/billing/*` | Token billing & payments |
| `/api/auth/*` | Authentication endpoints |
| `/api/user-hooks/*` | User webhooks management |
| `/sandbox/*` | Proxy to sandbox endpoints |
| `/webhook` | Incoming webhook → agent task |
| `/hook/:id` | User-defined webhooks |
| `/admin/*` | Admin panel APIs |

## Development Conventions

### Code Style

- **JavaScript**: ES2020+ with CommonJS modules (`require`/`module.exports`)
- **Async/Await**: Preferred over callbacks for async operations
- **Error Handling**: Try-catch with descriptive error messages
- **Logging**: `console.log` with `[SERVICE]` prefix for namespacing

### Testing

```bash
# Run unit tests
npm test

# Run E2E tests (Playwright)
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run E2E tests in debug mode
npm run test:e2e:debug

# Run E2E tests - critical path only
npm run test:e2e:smoke

# Run E2E tests - CI mode with HTML reporter
npm run test:e2e:ci
```

Tests are located in `tests/` directory and cover:
- Content status tracking
- Extended validators
- VK moderation and publishing
- YouTube MVP functionality
- Video pipeline
- Service-level unit tests
- E2E tests: critical path, onboarding, channels, content flow

### Service Architecture

Each service module follows a consistent pattern:

```javascript
const config = require('../config');
const dockerService = require('./docker.service');
const sessionService = require('./session.service');

async function someFunction(chatId, options) {
    const session = await sessionService.getOrCreateSession(chatId);
    const result = await dockerService.executeInContainer(
        session.containerId,
        'command to execute'
    );
    return result;
}

module.exports = {
    someFunction
};
```

### Key Design Patterns

1. **Session-per-user**: Each user has a session with `containerId`, `dataDir`, etc.
2. **Container isolation**: `sandbox-user-{chatId}` naming convention
3. **Bind-mount storage**: User data persisted to `/var/sandbox-data/{chatId}`
4. **Per-user PostgreSQL**: Database named `db_{chatId}` auto-provisioned
5. **Agent loop**: Tool-calling pattern for AI autonomy
