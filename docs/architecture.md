# Architecture — Subsystems & Services

## Ключевые подсистемы

| Подсистема | Точка входа | Описание |
|-----------|------------|----------|
| Сессии и контейнеры | `services/session.service.js` | In-memory Map (chatId → сессия). `createSession`, `destroySession`, `recoverAllSessions` |
| Docker CLI | `services/docker.service.js` | `child_process.spawn`, контейнеры `sandbox-user-{chatId}`, блокировка опасных команд |
| Состояние пользователей | `manage/store.js` | In-memory `statesCache` + файлы `{DATA_ROOT}/manage-state-{chatId}.json` (атомарная запись .tmp+rename). `videoPipelineSettings` (дефолт `{ model: 'veo3.1' }`), `imageGenSettings` (дефолт `'grok-imagine/text-to-image'`). `getImageGenSettings` валидирует против `ALLOWED_IMAGE_MODELS` |
| AI Agent Loop | `manage/telegram/agentLoop.js` (47 KB) | Цикл: контекст → LLM → tool_calls → toolHandlers → iterate до `task_completed` |
| Tool Handlers | `manage/telegram/toolHandlers.js` (77 KB) | Реализация инструментов AI: файлы, bash, планы, контекст |
| AI Tools Schema | `manage/telegram/tools.js` (24 KB) | JSON-определения для LLM. Наборы: `TOOLS_CHAT`, `TOOLS_WORKSPACE`, `TOOLS_TERMINAL` |
| Telegram Runner | `manage/telegram/runner.js` | Запуск/остановка per-user ботов (`bots` Map), обработка команд |
| AI Context | `manage/context.js` | Контекст для LLM: история, файлы, persona, навыки, планы |
| AI Prompts | `manage/prompts.js` | Системные промпты по режимам |
| AI Router | `services/ai_router_service.js` | Маршрутизация к ProTalk / OpenAI / OpenRouter |
| Контент Telegram | `services/telegramMvp.service.js` | Генерация, модерация, публикация. Планировщик 60 сек. `normalizeChannel` + `VALID_CHANNELS` |
| Контент общий | `services/contentMvp.service.js` (88 KB) | Оркестрация каналов, `enqueueAnnouncement`, blog announcements |
| Контент — фасад | `services/content/index.js` | Объединяет: repository, queue, worker, validators, limits, alerts, video |
| Контент VK | `services/vkMvp.service.js` | VK API v5.199, daily limit 5 |
| Контент OK | `services/okMvp.service.js` | OK API, daily limit 5 |
| Контент Pinterest | `services/pinterestMvp.service.js` | SEO-контент |
| Контент Instagram | `services/instagramMvp.service.js` | Graph API, daily limit 5. Reels: `tickIgReelsSchedule` → `reserveNextTopic(chatId, 'instagram_reels')`. Видео-черновики: флаг `isVideo: true` |
| Контент YouTube | `services/youtubeMvp.service.js` | YouTube Data API, Shorts/видео через видео-пайплайн |
| Контент Facebook | `services/facebookMvp.service.js` | Graph API. `facebook_jobs` хранит `topic_id`. `releaseTopic` в catch при ошибках генерации |
| Контент TikTok | `services/tiktokMvp.service.js` | Генерация, модерация (CW Bot `tt_mod:`), публикация |
| VK Video | `services/vkVideoMvp.service.js` | `video.save` → multipart upload → `wall.post`. Модерация `vk_vid_mod:` |
| Видео-пайплайн | `services/videoPipeline.service.js` | TikTok/VK/YouTube/Reels: фото → KIE.ai сцена → видео. `pendingCallbacks` Map |
| Видео репозиторий | `services/content/videoPipeline.repository.js` | `video_assets`, `interiors`, `video_channel_usage`. `CHANNELS = ['youtube','tiktok','instagram','vk']` |
| Контент WordPress | `services/wordpressMvp.service.js`, `services/blogGenerator.service.js` | FSM `draft→published`, `wp_mod:`. Кэш: `${DATA_ROOT}/{chatId}/blog-cache/` |
| Buffer кросс-постинг | `services/buffer.service.js` | Pinterest/Instagram/YouTube через Buffer API |
| Очистка | `services/outputContentCleanup.service.js` | `/workspace/output/content` в 05:00 МСК |
| Алерты | `services/content/alerts.js` | Уведомления о сбоях/лимитах |
| Биллинг | `manage/tokenBilling.js`, `manage/billingScheduler.js` | Баланс ProTalk, авто-отключение AI |
| Баланс API | `services/balance.service.js` | Dialog AI API |
| Email | `manage/email/processor.js` | IMAP polling + SMTP |
| Agent Queue | `manage/agentQueue.js` | FIFO, max 10/user, 2 сек cooldown |
| Снапшоты | `services/snapshot.service.js` | 10 версий, TTL 7 дней |
| Project Cache | `services/projectCache.service.js` | Кэш файлового дерева, TTL 30 дней |
| Хранилище | `services/storage.service.js` | DATA_ROOT, бэкапы, очистка |
| Input контекст | `services/inputImageContext.service.js` | `generateImage(chatId, prompt, ratio, model)`: input/ → интерьер из БД → `_buildPrompt()`. i2i-схемы в `I2I_SCHEMAS`. `flux-2/pro-image-to-image` i2i-only, `grok-imagine` t2i-only |

## Прямые сервисы каналов

`services/vk.service.js`, `services/ok.service.js`, `services/instagram.service.js`, `services/pinterest.service.js` — низкоуровневые операции (проверка токенов, списки групп/досок).

## Автоматические навыки-копирайтеры

При активном канале добавляются в AI-контекст: `tg-copywriter` (Telegram), `vk-copywriter` (VK), `ok-copywriter` (OK). Проверка через `isTelegramChannelActive(chatId)` и аналогичные функции в `manage/context.js`.

## Онбординг

`/setup.html` → CW Bot верификация 6-значным кодом (`manageStore.setPending/verify`) → выбор каналов → `onboardingComplete = true` → `/channels.html`.

## Admin Panel

`/admin/*` (защита `ADMIN_PASSWORD`). Страницы: `login.html`, `containers.html`, `container-manage.html`, `chat.html`, `skills.html`, `postgresql.html`, `tasks.html`, `apps.html`. Роуты: `routes/admin.routes.js`.

**Kill operation** (`DELETE /admin/container/:chatId/kill`) — удаление 8 слоёв: контейнер, PostgreSQL, файлы, state, бэкапы, снапшоты, MySQL, сессия.

## Документация проекта

`documents/` — планы интеграций по каналам (VK, OK, Pinterest, Instagram, YouTube, WordPress, Buffer). Доп: `KODA.md`, `QWEN.md`, `ROLE.md`, `PROCESSES.md`, `TASKS_BILLING.md`. Спецификации: `docs/superpowers/specs/`.
