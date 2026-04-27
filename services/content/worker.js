/**
 * TASK-006, TASK-007: Worker для обработки задач из БД-очереди
 * TASK-015: Polling для асинхронных video-генераций
 * TASK-020: WordPress blog generation pipeline
 */
const queueRepo = require('./queue.repository');
const { generateCorrelationId, JOB_STATUS, QUEUE_STATUS } = require('./status');
const videoService = require('./video.service');
const wordpressMvp = require('../../services/wordpressMvp.service');
const blogGenerator = require('../../services/blogGenerator.service');
const wpRepo = require('./wordpress.repository');
const telegramMvp = require('../../services/telegramMvp.service');
const contentLimits = require('./limits');
const manageStore = require('../../manage/store');
const alerts = require('./alerts');

function getNowInTz(tz) {
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const get = (t) => p.find((x) => x.type === t)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

const POLL_INTERVAL_MS = 2000; // OPTIMIZATION: Уменьшили интервал polling с 5с до 2с
const VIDEO_POLL_INTERVAL_MS = parseInt(process.env.VIDEO_POLL_INTERVAL_MS || '10000', 10); // TASK-015
const BLOG_POLL_INTERVAL_MS = 60000; // 60 секунд для планировщика тем WordPress
const MAX_CONCURRENT_JOBS = 3; // OPTIMIZATION: Увеличили с 1 до 3 для параллельной обработки
const STUCK_TIMEOUT_MINUTES = 10;

let workerHandle = null;
let videoPollingHandle = null; // TASK-015
let blogPollingHandle = null; // TASK-020: WordPress topic scheduler
let botsGetter = null;
let getCwBot = null; // Центральный CW бот
let jobHandlers = new Map();
let videoCallback = null; // TASK-015: callback при завершении генерации видео

/**
 * Регистрация обработчика для типа задачи
 * @param {string} jobType - тип задачи (generate, approve, publish)
 * @param {Function} handler - async (chatId, job, bot) => { success: boolean, error?: string }
 */
function registerJobHandler(jobType, handler) {
  jobHandlers.set(jobType, handler);
}

/**
 * TASK-015: Регистрация callback'а для завершения генерации видео
 * @param {Function} callback - async (chatId, job, bot, videoResult) => {}
 */
function registerVideoCallback(callback) {
  videoCallback = callback;
}

/**
 * Запуск worker'а
 * @param {Function} getBots - функция, возвращающая Map(chatId -> { bot })
 * @param {Function} getCwBot - функция, возвращающая центральный CW бот (опционально)
 */
function startWorker(getBots, getCwBotFn) {
  if (workerHandle) return;
  botsGetter = getBots;
  getCwBot = getCwBotFn;

  workerHandle = setInterval(async () => {
    try {
      await processAllQueues();
    } catch (e) {
      console.error('[CONTENT-WORKER] Error:', e.message);
    }
  }, POLL_INTERVAL_MS);

  // TASK-015: Запуск polling'а для видео
  videoPollingHandle = setInterval(async () => {
    try {
      await pollVideoGenerations();
    } catch (e) {
      console.error('[CONTENT-WORKER-VIDEO] Error:', e.message);
    }
  }, VIDEO_POLL_INTERVAL_MS);

  // TASK-020: Запуск планировщика тем для WordPress
  blogPollingHandle = setInterval(async () => {
    try {
      await scheduleBlogPosts();
    } catch (e) {
      console.error('[CONTENT-WORKER-BLOG] Error:', e.message);
    }
  }, BLOG_POLL_INTERVAL_MS);

  console.log('[CONTENT-WORKER] Started (queue + video polling + blog scheduler)');
}

/**
 * Остановить worker
 */
function stopWorker() {
  if (workerHandle) {
    clearInterval(workerHandle);
    workerHandle = null;
  }
  if (videoPollingHandle) {
    clearInterval(videoPollingHandle);
    videoPollingHandle = null;
  }
  if (blogPollingHandle) {
    clearInterval(blogPollingHandle);
    blogPollingHandle = null;
  }
  console.log('[CONTENT-WORKER] Stopped');
}

/**
 * Обработка очередей всех активных чатов
 */
async function processAllQueues() {
  if (!botsGetter) return;

  const bots = botsGetter();
  const cwBotToken = process.env.CW_BOT_TOKEN;

  // Получаем все чаты, для которых нужно обработать очереди
  let allChatIds = new Set();

  // 1. Чаты с собственными ботами
  if (bots && bots.size > 0) {
    for (const [chatId] of bots) {
      allChatIds.add(chatId);
    }
  }

  // 2. Чаты с центральным CW_BOT_TOKEN (из manageStore)
  if (cwBotToken) {
    try {
      const manageStore = require('../../manage/store');
      const allTokens = manageStore.getAllTokens ? manageStore.getAllTokens() : [];
      for (const { chatId, token } of allTokens) {
        if (token === cwBotToken) {
          allChatIds.add(chatId);
        }
      }
    } catch (e) {
      // Игнорируем ошибки доступа к manageStore
    }
  }

  

  if (allChatIds.size === 0) return;

  // Сбрасываем застрявшие задачи для всех чатов
  for (const chatId of allChatIds) {
    try {
      const resetCount = await queueRepo.resetStuckJobs(chatId, STUCK_TIMEOUT_MINUTES);
      if (resetCount > 0) {
        console.log(`[CONTENT-WORKER] Reset ${resetCount} stuck jobs for chat ${chatId}`);
      }
    } catch (e) {
      if (!e.message.includes('does not exist')) {
        console.error(`[CONTENT-WORKER] Failed to reset stuck jobs for ${chatId}:`, e.message);
      }
    }
  }

  // Обрабатываем задачи для чатов с собственными ботами
  for (const [chatId, entry] of bots || new Map()) {
    try {
      await processQueueForChat(chatId, entry.bot);
    } catch (e) {
      if (!e.message.includes('does not exist')) {
        console.error(`[CONTENT-WORKER] Error processing queue for ${chatId}:`, e.message);
      }
    }
  }

  // Обрабатываем задачи для чатов с центральным CW_BOT_TOKEN
  if (cwBotToken) {
    // Получаем cwBot из переданной функции
    const cwBot = getCwBot ? getCwBot() : null;
    
    if (!cwBot) {
      console.error('[CONTENT-WORKER] CW_BOT_TOKEN is set but cwBot is not available');
      return;
    }

    for (const chatId of allChatIds) {
      // Пропускаем чаты с собственными ботами (уже обработаны)
      if (bots && bots.has(chatId)) continue;

      // Проверяем, использует ли этот чат CW_BOT_TOKEN
      let stateToken = null;
      try {
        const manageStore = require('../../manage/store');
        const state = manageStore.getState ? manageStore.getState(chatId) : null;
        stateToken = state?.token || null;
        if (stateToken !== cwBotToken) continue;
      } catch (e) {
        continue;
      }

      try {
        await processQueueForChat(chatId, cwBot);
      } catch (e) {
        if (!e.message.includes('does not exist')) {
          console.error(`[CONTENT-WORKER] Error processing queue for ${chatId} (CW_BOT):`, e.message);
        }
      }
    }
  }
}

/**
 * Обработка очереди конкретного чата
 */
async function processQueueForChat(chatId, bot) {
  // Проверяем, есть ли уже задача в обработке
  const stats = await queueRepo.getQueueStats(chatId);
  if (stats.processing >= MAX_CONCURRENT_JOBS) {
    return; // Уже обрабатываем
  }

  // Забираем следующую задачу
  const jobs = await queueRepo.pollNextJobs(chatId, MAX_CONCURRENT_JOBS);
  if (!jobs || jobs.length === 0) return;

  for (const job of jobs) {
    await processJob(chatId, job, bot);
  }
}

/**
 * Обработка одной задачи
 */
async function processJob(chatId, job, bot) {
  const { id, job_type, payload, correlation_id } = job;
  const corrId = correlation_id || generateCorrelationId();
  
  console.log(`[CONTENT-WORKER] Processing job ${id} type=${job_type} corr=${corrId}`);
  
  const handler = jobHandlers.get(job_type);
  if (!handler) {
    console.error(`[CONTENT-WORKER] No handler for job type: ${job_type}`);
    await queueRepo.markFailed(chatId, id, `Unknown job type: ${job_type}`, false);
    return;
  }
  
  try {
    const result = await handler(chatId, job, bot, corrId);

    if (!result) {
      console.error(`[CONTENT-WORKER] Job ${id} handler returned undefined`);
      await queueRepo.markFailed(chatId, id, 'Handler returned undefined', false);
      return;
    }

    if (result.success) {
      await queueRepo.markDone(chatId, id);
      console.log(`[CONTENT-WORKER] Job ${id} completed successfully`);
    } else {
      const errorMsg = result.error || 'Handler returned failure';
      console.error(`[CONTENT-WORKER] Job ${id} failed: ${errorMsg}`);
      await queueRepo.markFailed(chatId, id, errorMsg, result.retry !== false);
    }
  } catch (e) {
    console.error(`[CONTENT-WORKER] Job ${id} threw error:`, e.message, '\n', e.stack);
    await queueRepo.markFailed(chatId, id, e.message, true);
  }
}

/**
 * Поставить задачу в очередь (wrapper для удобства)
 */
async function enqueueJob(chatId, options) {
  await queueRepo.ensureQueueSchema(chatId);
  return queueRepo.enqueue(chatId, {
    ...options,
    correlationId: options.correlationId || generateCorrelationId()
  });
}

// ============================================
// TASK-015: Video polling
// ============================================

/**
 * Polling активных генераций видео
 */
async function pollVideoGenerations() {
  if (!botsGetter) return;
  
  const bots = botsGetter();
  if (!bots || bots.size === 0) return;
  
  for (const [chatId, entry] of bots) {
    try {
      await pollVideoForChat(chatId, entry.bot);
    } catch (e) {
      // Игнорируем ошибки если база данных не существует (канал ещё не подключён)
      if (!e.message.includes('does not exist')) {
        console.error(`[CONTENT-WORKER-VIDEO] Error polling for ${chatId}:`, e.message);
      }
    }
  }
}

/**
 * Polling генераций для конкретного чата
 */
async function pollVideoForChat(chatId, bot) {
  const repository = require('./repository');
  
  // Получаем jobs в статусе MEDIA_GENERATING
  const pendingJobs = await repository.getPendingMediaJobs(chatId, 5);
  
  for (const job of pendingJobs) {
    // Проверяем, что это видео-генерация
    if (job.content_type !== 'text+video') continue;
    
    // Получаем связанную генерацию
    const generation = await videoService.getGenerationByJobId(chatId, job.id);
    if (!generation) {
      console.warn(`[CONTENT-WORKER-VIDEO] No generation found for job ${job.id}`);
      continue;
    }
    
    // Проверяем таймаут
    const elapsed = Date.now() - new Date(generation.created_at).getTime();
    if (elapsed > videoService.VIDEO_TIMEOUT_SEC * 1000) {
      console.log(`[CONTENT-WORKER-VIDEO] Generation ${generation.generation_id} timed out`);
      await videoService.markGenerationTimeout(chatId, generation.generation_id);
      
      // Вызываем callback с результатом timeout
      if (videoCallback) {
        await videoCallback(chatId, job, bot, {
          success: false,
          timedOut: true,
          error: 'Video generation timed out'
        });
      }
      continue;
    }
    
    // Проверяем статус
    try {
      const status = await videoService.checkVideoStatus(chatId, generation.generation_id);
      
      if (status.status === videoService.VIDEO_STATUS.COMPLETED && status.videoUrl) {
        console.log(`[CONTENT-WORKER-VIDEO] Generation ${generation.generation_id} completed`);
        
        // Скачиваем видео
        const videoBuffer = await videoService.downloadVideo(status.videoUrl);
        
        // Вызываем callback с результатом
        if (videoCallback) {
          await videoCallback(chatId, job, bot, {
            success: true,
            videoUrl: status.videoUrl,
            videoBuffer,
            generationId: generation.generation_id
          });
        }
      } else if (status.status === videoService.VIDEO_STATUS.FAILED) {
        console.error(`[CONTENT-WORKER-VIDEO] Generation ${generation.generation_id} failed:`, status.error);
        
        // Вызываем callback с ошибкой
        if (videoCallback) {
          await videoCallback(chatId, job, bot, {
            success: false,
            error: status.error || 'Video generation failed'
          });
        }
      }
      // Для PENDING/PROCESSING — просто ждём следующий polling
    } catch (e) {
      console.error(`[CONTENT-WORKER-VIDEO] Error checking status for ${generation.generation_id}:`, e.message);
    }
  }
}

// ============================================
// TASK-020: WordPress Blog Scheduler
// ============================================

/**
 * Планировщик тем для WordPress
 * Каждый tick проверяет пользователей с включенным WordPress
 * и создаёт задачи на генерацию статей из свободных тем
 */
async function scheduleBlogPosts() {
  if (!botsGetter) return;

  const bots = botsGetter();
  if (!bots || bots.size === 0) return;

  for (const [chatId] of bots) {
    try {
      await scheduleBlogPostsForChat(chatId);
    } catch (e) {
      if (!e.message.includes('does not exist')) {
        console.error(`[CONTENT-WORKER-BLOG] Error scheduling for ${chatId}:`, e.message);
      }
    }
  }
}

/**
 * Планирование постов для конкретного пользователя
 */
async function scheduleBlogPostsForChat(chatId) {
  // Проверяем, что WordPress подключён
  const wpConfig = manageStore.getWpConfig(chatId);
  if (!wpConfig || !wpConfig.baseUrl || !wpConfig.username || !wpConfig.appPassword) {
    return;
  }

  // Автоматический планировщик работает только при настроенном расписании
  if (!wpConfig.scheduleTime) {
    return;
  }

  const tz = wpConfig.scheduleTz || 'Europe/Moscow';
  const now = getNowInTz(tz);

  // Проверяем день недели (1=Пн, 7=Вс)
  const scheduleDays = wpConfig.scheduleDays;
  if (scheduleDays && scheduleDays.length > 0) {
    const dowDate = new Date(now.date + 'T12:00:00');
    const dow = dowDate.getDay() || 7; // 0=Вс → 7
    if (!scheduleDays.includes(dow)) return;
  }

  // Проверяем временное окно
  const [startH, startM] = wpConfig.scheduleTime.split(':').map(Number);
  const [nowH, nowM] = now.time.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const nowMinutes = nowH * 60 + nowM;
  if (nowMinutes < startMinutes) return;
  if (wpConfig.scheduleEndTime) {
    const [endH, endM] = wpConfig.scheduleEndTime.split(':').map(Number);
    if (nowMinutes >= endH * 60 + endM) return;
  }

  // Проверяем лимиты
  const perDayLimit = wpConfig.dailyLimit || wpConfig.postsPerDay || 3;
  let publishedToday = { today: { blogGenerated: 0 } };
  try {
    publishedToday = await contentLimits.getUsageStats(chatId, now.date, tz);
  } catch (statsErr) {
    console.warn(`[CONTENT-WORKER-BLOG] getUsageStats failed, skipping limit check: ${statsErr.message}`);
  }
  if (publishedToday.today.blogGenerated >= perDayLimit) {
    return;
  }

  // [П1] Queue overflow guard: не добавляем в очередь если уже достаточно задач
  let queueStats = { queued: 0, processing: 0, failed: 0 };
  try {
    queueStats = await queueRepo.getQueueStats(chatId);
  } catch (statsErr) {
    console.warn(`[CONTENT-WORKER-BLOG] getQueueStats failed, skipping queue guard: ${statsErr.message}`);
  }
  const inFlight = (queueStats.queued || 0) + (queueStats.processing || 0);
  if (inFlight >= perDayLimit) {
    return;
  }

  // Проверяем minIntervalHours (минимальный интервал между постами)
  if (wpConfig.minIntervalHours && wpConfig.lastPublishedAt) {
    const hoursSince = (Date.now() - new Date(wpConfig.lastPublishedAt).getTime()) / 3600000;
    if (hoursSince < wpConfig.minIntervalHours) return;
  }

  // Выбираем следующую тему (резервируем её)
  const contentRepo = require('./repository');
  const topic = await contentRepo.reserveNextTopic(chatId, 'wordpress');
  if (!topic) return;

  // Создаём задачу на генерацию с откатом при ошибке
  try {
    await enqueueJob(chatId, {
      jobType: 'wordpress_generate',
      payload: {
        topicId: topic.id,
        topic: topic.topic,
        keywords: topic.focus || topic.secondary || '',
        techDocId: topic.tech_doc_id || null
      }
    });
    console.log(`[CONTENT-WORKER-BLOG] Enqueued blog post generation for chat ${chatId}, topic ${topic.id}`);
  } catch (err) {
    await contentRepo.releaseTopic(chatId, topic.id).catch(() => {});
    throw err;
  }
}

/**
 * Обработчик задачи на генерацию WordPress поста
 */
async function handleWordPressGeneration(chatId, job, bot) {
  const { topicId, topic, keywords, techDocId } = job.payload;
  const corrId = job.correlation_id || generateCorrelationId();
  let kieAiAlreadyCalled = false; // [П3] взводится после успешного вызова blogGenerator.generate()

  console.log(`[CONTENT-WORKER-BLOG] Generating post for topic ${topicId}: ${topic}`);

  try {
    // 1. Генерация статьи
    const article = await blogGenerator.generate(chatId, {
      topic,
      keywords,
      techDocId,
      moderatorNote: null
    });
    kieAiAlreadyCalled = true; // [П3] KIE.ai вызван внутри generate() — дальнейшие ретраи не должны вызывать его снова

    console.log(`[CONTENT-WORKER-BLOG] Article generated: ${article.seoTitle}`);

    // 2. Создаём черновик поста в БД
    const postId = await wpRepo.createDraftPost(chatId, {
      jobId: null, // content_job_queue.id != content_jobs.id, FK references content_jobs
      topicId: topicId || null,
      bodyHtml: article.bodyHtml,
      seoTitle: article.seoTitle,
      metaDesc: article.metaDesc,
      featuredImageUrl: null, // Пока нет изображения
      contentType: 'blog',
      publishStatus: 'draft'
    });

    // 3. Загружаем изображение в WordPress
    let mediaResult = null;
    if (article.imageBuffer) {
      try {
        mediaResult = await wordpressMvp.uploadMedia(chatId, {
          buffer: article.imageBuffer,
          filename: article.imageFilename || 'cover.jpg',
          mimeType: article.imageMime || 'image/jpeg',
          altText: article.seoTitle,
          title: article.seoTitle
        });

        console.log(`[CONTENT-WORKER-BLOG] Media uploaded: ${mediaResult.id}`);
      } catch (e) {
        console.warn('[CONTENT-WORKER-BLOG] Failed to upload image, continuing without it:', e.message);
      }
    }

    // 4. Создаём черновик в WordPress
    const wpDraft = await wordpressMvp.createDraft(chatId, {
      title: article.seoTitle,
      content: article.bodyHtml,
      excerpt: article.metaDesc,
      featured_media: mediaResult?.id || 0,
      slug: article.slug
    });

    console.log(`[CONTENT-WORKER-BLOG] WP draft created: ${wpDraft.id}, preview: ${wpDraft.preview_link}`);

    // 5. Обновляем IDs в БД
    await wpRepo.updateWpIds(chatId, postId, {
      wpMediaId: mediaResult?.id || null,
      wpPostId: wpDraft.id,
      wpPermalink: wpDraft.link,
      wpPreviewUrl: wpDraft.preview_link,
      bodyHtml: article.bodyHtml,
      seoTitle: article.seoTitle,
      metaDesc: article.metaDesc,
      featuredImageUrl: mediaResult?.source_url || null
    });

    // 6. Переходим в статус ready (ожидание модерации)
    await wpRepo.markReady(chatId, postId);

    // 7. Отправляем на модерацию (если включено)
    const wpConfig = manageStore.getWpConfig(chatId);
    const premoderationEnabled = wpConfig?.premoderationEnabled !== false; // По умолчанию включена
    if (premoderationEnabled) {
      await sendBlogModerationRequest(chatId, postId, bot);
    } else {
      // Автопубликация без модерации — ставим в очередь на публикацию
      await wpRepo.markApproved(chatId, postId);
      await enqueueJob(chatId, { jobType: 'wordpress_publish', payload: { postId } });
    }

    // 8. Тема уже отмечена как использованная в reserveNextTopic
    // (content_topics.used_at проставлен автоматически)

    console.log(`[CONTENT-WORKER-BLOG] Post ${postId} ${premoderationEnabled ? 'sent to moderation' : 'queued for publish'}`);

    return { success: true };
  } catch (e) {
    console.error('[CONTENT-WORKER-BLOG] Generation failed:', e.message);

    // Освобождаем тему обратно в pending
    if (job.payload?.topicId) {
      const contentRepo = require('./repository');
      await contentRepo.releaseTopic(chatId, job.payload.topicId).catch(() => {});
    }

    // Пытаемся отметить ошибку в БД
    try {
      const posts = await wpRepo.findByStatus(chatId, 'draft');
      if (posts.length > 0) {
        const postId = posts[0].id;
        await wpRepo.markError(chatId, postId, e.message);
      }
    } catch (dbError) {
      console.error('[CONTENT-WORKER-BLOG] Failed to update error status:', dbError.message);
    }

    // [П2c] Алерт модератору с правильной сигнатурой sendAlertToModerator(bot, userId, alert)
    try {
      const wpConfig = manageStore.getWpConfig(chatId);
      const moderatorId = manageStore.getEffectiveModerator(chatId, wpConfig);
      if (bot && moderatorId) {
        await alerts.sendAlertToModerator(bot, moderatorId, {
          type: e.name === 'InsufficientBalanceError' ? 'kie_insufficient_balance'
              : e.name === 'KieDailyLimitError' ? 'kie_daily_limit'
              : 'blog_generation_failed',
          severity: (e.name === 'InsufficientBalanceError' || e.name === 'KieDailyLimitError') ? 'critical' : 'warning',
          message: e.name === 'InsufficientBalanceError'
            ? '🚨 KIE.ai: баланс исчерпан (402) — генерация остановлена'
            : e.name === 'KieDailyLimitError'
            ? '🚨 KIE.ai: достигнут дневной лимит вызовов — генерация остановлена'
            : `Ошибка генерации блога: ${e.message}`
        });
      }
    } catch (alertError) {
      console.error('[CONTENT-WORKER-BLOG] Failed to send alert:', alertError.message);
    }

    // [П3] retry:false если KIE.ai уже был вызван — не тратить токены повторно
    const noRetry = kieAiAlreadyCalled
      || e.name === 'InsufficientBalanceError'
      || e.name === 'KieDailyLimitError'
      || e.message.includes('foreign key constraint');
    return { success: false, error: e.message, retry: !noRetry };
  }
}

/**
 * Отправить запрос на модерацию блога
 */
async function sendBlogModerationRequest(chatId, postId, bot) {
  try {
    const post = await wpRepo.getPostById(chatId, postId);
    if (!post || !post.wp_preview_url) {
      throw new Error('Post or preview URL not found');
    }

    // Получаем конфигурацию канала
    const wpConfig = manageStore.getWpConfig(chatId);
    const moderatorId = manageStore.getEffectiveModerator(chatId, wpConfig);

    // Формируем сообщение
    const _now = new Date();
    const _msk = new Date(_now.getTime() + (3 * 60 + _now.getTimezoneOffset()) * 60000);
    const _pad = n => String(n).padStart(2, '0');
    const _draftMeta = `👤 ${chatId} · 🕐 ${_pad(_msk.getDate())}.${_pad(_msk.getMonth() + 1)}.${_msk.getFullYear()} ${_pad(_msk.getHours())}:${_pad(_msk.getMinutes())} МСК`;
    const message = `📝 Новая статья для блога
${_draftMeta}
Заголовок: ${post.seo_title || 'Без заголовка'}
Темы: ${post.meta_desc || 'без описания'}

[Превью](${post.wp_preview_url})

[✅ Опубликовать] [🔁 Переписать] [❌ Отклонить]`;

    // Используем CW_BOT для отправки
    const cwBotToken = process.env.CW_BOT_TOKEN;
    if (!cwBotToken) {
      throw new Error('CW_BOT_TOKEN not configured');
    }

    const { Telegraf } = require('telegraf');
    const { Markup } = require('telegraf');
    const cwBot = new Telegraf(cwBotToken);

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Одобрить', `wp_mod:approve:${postId}`),
        Markup.button.callback('❌ Отклонить', `wp_mod:reject:${postId}`)
      ],
      [
        Markup.button.callback('🔁 Текст', `wp_mod:rewrite:${postId}`),
        Markup.button.callback('🖼 Фото', `wp_mod:regen_image:${postId}`)
      ]
    ]);

    await cwBot.telegram.sendMessage(moderatorId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
      ...keyboard
    });

    console.log(`[CONTENT-WORKER-BLOG] Moderation request sent to ${moderatorId} for post ${postId}`);
  } catch (e) {
    console.error('[CONTENT-WORKER-BLOG] Failed to send moderation request:', e.message);
    // Не кидаем ошибку — просто логируем
  }
}

/**
 * Обработчик публикации одобренного WordPress поста
 */
async function handleWordPressPublish(chatId, job, bot) {
  const { postId } = job.payload;

  console.log(`[CONTENT-WORKER-BLOG] Publishing post ${postId}`);

  try {
    const post = await wpRepo.getPostById(chatId, postId);
    if (!post || !post.wp_post_id) {
      throw new Error('Post not found or missing WP post ID');
    }

    // Публикуем в WordPress
    const published = await wordpressMvp.publishPost(chatId, post.wp_post_id);
    console.log(`[CONTENT-WORKER-BLOG] Post published in WP: ${published.link}`);

    // Обновляем статус
    await wpRepo.markPublished(chatId, postId, published.link);

    // Уведомляем модератора об успешной публикации
    try {
      if (bot && bot.telegram) {
        const wpConfig = manageStore.getWpConfig(chatId);
        const notifyId = wpConfig?.moderatorUserId
          || process.env.CONTENT_MVP_MODERATOR_USER_ID
          || chatId;
        await bot.telegram.sendMessage(
          notifyId,
          `✅ Статья опубликована!\n\n📝 ${post.seo_title || 'Без заголовка'}\n\n🔗 ${published.link}`
        );
      }
    } catch (notifyErr) {
      console.warn('[CONTENT-WORKER-BLOG] Failed to notify moderator:', notifyErr.message);
    }

    // Публикуем анонс в Telegram канале пользователя
    await publishBlogAnnouncement(chatId, post);

    return { success: true };
  } catch (e) {
    console.error('[CONTENT-WORKER-BLOG] Publish failed:', e.message);

    try {
      await wpRepo.markError(chatId, postId, e.message);
    } catch (dbError) {
      console.error('[CONTENT-WORKER-BLOG] Failed to update error:', dbError.message);
    }

    return { success: false, error: e.message, retry: true };
  }
}

/**
 * Опубликовать анонс статьи в Telegram канале
 */
async function publishBlogAnnouncement(chatId, post) {
  try {
    const settings = telegramMvp.getContentSettings(chatId);
    if (!settings.channelId) {
      console.warn('[CONTENT-WORKER-BLOG] No Telegram channel configured for announcement');
      return;
    }

    // Получаем бот
    const botEntry = botsGetter?.get(chatId);
    if (!botEntry?.bot) {
      console.error('[CONTENT-WORKER-BLOG] No bot available for announcement');
      return;
    }

    // Формируем текст анонса
    const text = `${post.seo_title || 'Новая статья'}

${post.meta_desc || ''}

👉 Читать полностью: ${post.wp_permalink || post.wp_preview_url}`;

    // Отправляем сообщение с изобраением (если есть)
    if (post.featured_image_url) {
      await botEntry.bot.telegram.sendPhoto(settings.channelId, post.featured_image_url, {
        caption: text,
        parse_mode: 'Markdown'
      });
    } else {
      await botEntry.bot.telegram.sendMessage(settings.channelId, text);
    }

    console.log(`[CONTENT-WORKER-BLOG] Announcement sent to Telegram channel for post ${post.id}`);
  } catch (e) {
    console.error('[CONTENT-WORKER-BLOG] Failed to send announcement:', e.message);
  }
}

module.exports = {
  startWorker,
  stopWorker,
  registerJobHandler,
  registerVideoCallback,
  enqueueJob,
  processAllQueues,
  pollVideoGenerations,
  scheduleBlogPosts,
  handleWordPressGeneration,
  handleWordPressPublish,
  publishBlogAnnouncement,
  sendBlogModerationRequest,
  POLL_INTERVAL_MS,
  MAX_CONCURRENT_JOBS
};
