/**
 * Instagram MVP Service — генерация, модерация, публикация Instagram-постов
 * Публикация через Buffer GraphQL API (аналогично Pinterest)
 */
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const fetch = require('node-fetch');
const sharp = require('sharp');
const config = require('../config');
const aiRouterService = require('./ai_router_service');
const manageStore = require('../manage/store');
const sessionService = require('./session.service');
const dockerService = require('./docker.service');
const storageService = require('./storage.service');
const bufferService = require('./buffer.service');
const metaGraph = require('./metaGraph.service');
const igRepo = require('./content/instagram.repository');
const inputImageContext = require('./inputImageContext.service');
const { safeSendToModerator, formatDraftMeta } = require('./telegram.utils');
const videoPipeline = require('./videoPipeline.service');

const contentModules = require('./content/index');
const channelSkills = require('./channelSkills');
const {
  generateCorrelationId,
  repository,
  queueRepo,
  worker
} = contentModules;

let cwBot = null; // Центральный бот премодерации (CW_BOT_TOKEN)

const SCHEDULE_TZ = process.env.CONTENT_MVP_TZ || 'Europe/Moscow';
const MAX_IMAGE_ATTEMPTS = 3;
const MAX_REJECT_ATTEMPTS = 3;
const DAILY_IG_LIMIT = parseInt(process.env.INSTAGRAM_DAILY_LIMIT || '3', 10);
const DAILY_IG_REELS_LIMIT = parseInt(process.env.INSTAGRAM_REELS_DAILY_LIMIT || '3', 10);
const PROFILE_FILES = ['IDENTITY.md', 'SOUL.md'];
const IG_MODERATION_TIMEOUT_HOURS = parseInt(process.env.INSTAGRAM_MODERATION_TIMEOUT_HOURS || '24', 10);

let schedulerHandle = null;
let botsGetter = null;

// ============================================
// Утилиты
// ============================================

function getNowInTz(tz) {
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const get = (t) => p.find((x) => x.type === t)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`
  };
}

function isValidTz(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch { return false; }
}

function getIgSettings(chatId) {
  const cfg = manageStore.getInstagramConfig(chatId);
  manageStore.migrateIntegrationSettings(chatId);
  const globalInt = manageStore.getIntegrationSettings(chatId) || {};
  return {
    isActive: !!cfg?.is_active,
    bufferApiKey: globalInt.buffer_api_key || cfg?.buffer_api_key || null,
    bufferChannelId: cfg?.buffer_channel_id || null,
    scheduleTime: cfg?.schedule_time || '10:00',
    scheduleEndTime: cfg?.schedule_end_time || null,
    scheduleTz: isValidTz(cfg?.schedule_tz) ? cfg.schedule_tz : SCHEDULE_TZ,
    dailyLimit: cfg?.daily_limit || DAILY_IG_LIMIT,
    publishIntervalHours: Number.isFinite(cfg?.publish_interval_hours) ? cfg.publish_interval_hours : 4,
    randomPublish: !!cfg?.random_publish,
    premoderationEnabled: cfg?.auto_publish === true ? false : true,
    allowedWeekdays: Array.isArray(cfg?.allowed_weekdays) ? cfg.allowed_weekdays : [0, 1, 2, 3, 4, 5, 6],
    moderator_user_id: cfg?.moderator_user_id || globalInt.moderator_user_id || null,
    stats: cfg?.stats || { total_posts: 0, posts_today: 0, last_post_date: null }
  };
}

function getIgReelsSettings(chatId) {
  const cfg = manageStore.getInstagramReelsConfig(chatId) || {};
  manageStore.migrateIntegrationSettings(chatId);
  const globalInt = manageStore.getIntegrationSettings(chatId) || {};
  return {
    isActive: !!cfg?.is_active,
    bufferApiKey: globalInt.buffer_api_key || null,
    bufferChannelId: cfg?.buffer_channel_id || null,
    scheduleTime: cfg?.schedule_time || '14:00',
    scheduleEndTime: cfg?.schedule_end_time || null,
    scheduleTz: isValidTz(cfg?.schedule_tz) ? cfg.schedule_tz : SCHEDULE_TZ,
    dailyLimit: Number.isFinite(cfg?.daily_limit) ? cfg.daily_limit : DAILY_IG_REELS_LIMIT,
    publishIntervalHours: Number.isFinite(cfg?.publish_interval_hours) ? cfg.publish_interval_hours : 6,
    randomPublish: !!cfg?.random_publish,
    premoderationEnabled: cfg?.auto_publish === true ? false : true,
    allowedWeekdays: Array.isArray(cfg?.allowed_weekdays) ? cfg.allowed_weekdays : [0, 1, 2, 3, 4, 5, 6],
    moderator_user_id: cfg?.moderator_user_id || globalInt.moderator_user_id || null,
    stats: cfg?.stats || { total_posts: 0, posts_today: 0, last_post_date: null }
  };
}

// ============================================
// Загрузка контента пользователя
// ============================================

async function loadMaterialsText(chatId, limit = 10) {
  await repository.ensureSchema(chatId);
  const materials = await repository.loadMaterials(chatId, limit);
  const parts = [];
  for (const item of materials) {
    const content = String(item.content || '').trim();
    if (!content) continue;
    parts.push(`### ${item.title}\n${content.slice(0, 4000)}`);
  }
  return parts.join('\n\n').slice(0, 20000);
}

async function loadUserPersona(chatId) {
  const storageDir = storageService.getDataDir(String(chatId));
  const repoDir = path.resolve(__dirname, '..', 'data', `user_${chatId}`);
  const dirs = [repoDir, storageDir];
  const sections = [];

  for (const fileName of PROFILE_FILES) {
    for (const dir of dirs) {
      try {
        const text = await fs.readFile(path.join(dir, fileName), 'utf8');
        if (text.trim()) {
          sections.push(`## ${fileName.replace(/\.md$/i, '')}\n${text.trim().slice(0, 4000)}`);
          break;
        }
      } catch { /* next */ }
    }
  }

  return sections.join('\n\n').slice(0, 16000);
}

// ============================================
// AI-генерация для Instagram
// ============================================

async function generateIgPostText(chatId, topic, materialsText, personaText, skillSlug = 'instagram-copywriter') {
  const data = manageStore.getState(chatId);
  const hasApiKey = data?.aiCustomApiKey || data?.aiAuthToken;
  if (!hasApiKey || !data?.aiModel) {
    throw new Error('AI model is not configured');
  }

  const prompt = `Ты SMM-маркетолог Instagram. Создай контент для поста в Instagram.

Тема: ${topic.topic}
${topic.focus ? `Фокус: ${topic.focus}` : ''}

${personaText ? `--- ПЕРСОНА ---\n${personaText}\n---` : ''}
${materialsText ? `--- МАТЕРИАЛЫ ---\n${materialsText}\n---` : ''}

Ответь строго в формате JSON:
{
  "caption": "подпись к посту для Instagram (150–2200 символов, вовлекающая, с хэштегами в конце)"
}

Требования:
- caption: 300–500 символов оптимально, первая строка — хук (цепляет внимание), 5–15 хэштегов в конце, эмодзи как маркеры (2–4), CTA в конце
- Стиль: живой, разговорный, без канцелярита
- Язык: русский`;

  const sysPrompt = await channelSkills.buildSystemPrompt(
    skillSlug,
    'Ты SMM-маркетолог Instagram.',
    'Отвечай только JSON.'
  );
  const messages = [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: prompt }
  ];

  const authToken = data.aiCustomApiKey || data.aiAuthToken;
  const resp = await aiRouterService.callAI(chatId, authToken, data.aiModel, messages, null, data.aiUserEmail);
  const content = resp?.choices?.[0]?.message?.content || '';

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI did not return valid JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    caption: String(parsed.caption || '').slice(0, 2200)
  };
}

async function generateIgImage(chatId, topic) {
  const imageModel = manageStore.getImageGenSettings(chatId).model;
  return inputImageContext.generateImageWithFullContext(
    chatId,
    topic,
    `Topic: ${topic.topic}`,  // fallback если нет файлов в /input/
    '1:1',
    'instagram'
  );
}

async function saveImageToContainer(chatId, buffer, jobId) {
  const session = await sessionService.getOrCreateSession(chatId);
  const localTmp = path.join(os.tmpdir(), `ig-image-${chatId}-${jobId}.png`);
  await fs.writeFile(localTmp, buffer);
  const containerPath = `/workspace/output/content/ig_${jobId}.png`;
  await sessionService.executeCommand(chatId, 'mkdir -p /workspace/output/content', 10);
  await dockerService.copyToContainer(localTmp, session.containerId, containerPath);
  await fs.unlink(localTmp).catch(() => {});
  return containerPath;
}

// ============================================
// Draft Management (in-memory)
// ============================================

function getDrafts(chatId) {
  const data = manageStore.getState(chatId) || {};
  return data.igDrafts || {};
}

function setDraft(chatId, draftId, draft) {
  const states = manageStore.getAllStates();
  let data = states[chatId];
  if (!data) {
    data = {};
    states[chatId] = data;
  }
  data.igDrafts = data.igDrafts || {};
  data.igDrafts[draftId] = draft;
  return manageStore.persist(chatId);
}

async function removeDraft(chatId, draftId) {
  const data = manageStore.getState(chatId) || {};
  if (data.igDrafts && data.igDrafts[draftId]) {
    delete data.igDrafts[draftId];
    await manageStore.persist(chatId);
  }
}

// ============================================
// Генерация Instagram поста
// ============================================

async function handleIgGenerateJob(chatId, queueJob, bot, correlationId) {
  console.log(`[IG-GENERATE] ${chatId} starting generation, corr=${correlationId}`);
  const settings = getIgSettings(chatId);

  await repository.ensureSchema(chatId);
  await igRepo.ensureSchema(chatId);

  // Дневной лимит
  const publishedToday = await igRepo.countPublishedToday(chatId, settings.scheduleTz);
  if (publishedToday >= settings.dailyLimit) {
    return { success: false, error: `Дневной лимит Instagram-постов исчерпан (${publishedToday}/${settings.dailyLimit})`, retry: false };
  }

  // Проверка дня недели
  const now = new Date();
  let dayOfWeek;
  try {
    const weekdayStr = new Intl.DateTimeFormat('en-US', { timeZone: settings.scheduleTz, weekday: 'short' }).format(now);
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    dayOfWeek = weekdayMap[weekdayStr] ?? now.getDay();
  } catch {
    dayOfWeek = now.getDay();
  }
  if (!settings.allowedWeekdays.includes(dayOfWeek)) {
    return { success: false, error: `Публикация не разрешена в этот день недели (${dayOfWeek})`, retry: false };
  }

  // Выбор темы
  console.log(`[IG-GENERATE] ${chatId} selecting topic...`);
  const topicRow = await repository.reserveNextTopic(chatId, 'instagram');
  if (!topicRow) {
    console.log(`[IG-GENERATE] ${chatId} no pending topics available`);
    return { success: false, error: 'Нет доступных тем', retry: false };
  }
  console.log(`[IG-GENERATE] ${chatId} topic selected: id=${topicRow.id}, "${topicRow.topic}"`);
  const topic = {
    sheetRow: topicRow.id,
    topic: topicRow.topic,
    focus: topicRow.focus || '',
    secondary: topicRow.secondary || '',
    lsi: topicRow.lsi || ''
  };

  // Загрузка материалов и персоны
  const [materialsText, personaText] = await Promise.all([
    loadMaterialsText(chatId, 12),
    loadUserPersona(chatId)
  ]);

  // Генерация текста
  console.log(`[IG-GENERATE] ${chatId} generating text...`);
  let igText;
  try {
    igText = await generateIgPostText(chatId, topic, materialsText, personaText);
    console.log(`[IG-GENERATE] ${chatId} text generated (${(igText.caption || '').length} chars)`);
  } catch (e) {
    console.error(`[IG-GENERATE] ${chatId} text generation failed: ${e.message}`);
    await repository.updateTopicStatus(chatId, topic.sheetRow, 'pending', `ig_text_failed: ${e.message}`);
    return { success: false, error: `IG text generation failed: ${e.message}`, retry: true };
  }

  // Генерация изображения
  console.log(`[IG-GENERATE] ${chatId} generating image...`);
  let imagePath = '';
  let imageAttempts = 0;
  let imageErr = '';
  for (let i = 1; i <= MAX_IMAGE_ATTEMPTS; i++) {
    try {
      imageAttempts = i;
      const imageBuffer = await generateIgImage(chatId, topic);
      const tempId = `${topic.sheetRow}_${Date.now()}`;
      imagePath = await saveImageToContainer(chatId, imageBuffer, tempId);
      imageErr = '';
      break;
    } catch (e) {
      imageErr = e?.message || String(e);
    }
  }
  if (!imagePath) {
    console.error(`[IG-GENERATE] ${chatId} image generation failed after ${imageAttempts} attempts: ${imageErr}`);
    await repository.updateTopicStatus(chatId, topic.sheetRow, 'pending', `ig_image_failed: ${imageErr}`);
    const isKieLimit = imageErr.includes('daily limit') || imageErr.includes('KieDailyLimit');
    return { success: false, error: `IG image generation failed: ${imageErr}`, retry: !isKieLimit };
  }
  console.log(`[IG-GENERATE] ${chatId} image saved: ${imagePath} (attempts: ${imageAttempts})`);

  // Запись в БД
  const jobId = await igRepo.createJob(chatId, {
    topic: topic.topic,
    caption: igText.caption,
    imagePrompt: igText.imagePrompt,
    imagePath,
    status: 'ready',
    imageAttempts,
    correlationId
  });

  const draft = {
    jobId,
    topic,
    caption: igText.caption,
    imagePrompt: igText.imagePrompt,
    imagePath,
    correlationId,
    rejectedCount: 0
  };

  // Маршрутизация: модерация или автопубликация
  if (!settings.premoderationEnabled) {
    await setDraft(chatId, String(jobId), draft);
    await publishIgPost(chatId, bot, jobId, correlationId);
  } else {
    await sendIgToModerator(chatId, bot, draft);
  }

  return { success: true, data: { jobId } };
}

// ============================================
// Публикация Instagram поста
// ============================================

async function publishIgPost(chatId, bot, jobId, correlationId) {
  const corrId = correlationId || generateCorrelationId();
  const job = await igRepo.getJobById(chatId, jobId);
  if (!job) throw new Error(`Instagram job ${jobId} not found`);

  const cfg = manageStore.getInstagramConfig(chatId);
  if (!cfg) throw new Error('Instagram не настроен');

  const useMeta = cfg.meta_method === 'meta';

  const globalInt = manageStore.getIntegrationSettings(chatId) || {};
  const bufferApiKey = globalInt.buffer_api_key || cfg.buffer_api_key;
  const bufferChannelId = cfg.buffer_channel_id;

  if (!useMeta && (!bufferApiKey || !bufferChannelId)) {
    throw new Error('Buffer API key или channel_id не настроены для Instagram');
  }
  if (useMeta && (!cfg.meta_page_access_token || !cfg.meta_ig_business_account_id)) {
    throw new Error('Meta page_access_token или ig_business_account_id не настроены');
  }

  // Копируем изображение из контейнера на хост
  const session = await sessionService.getOrCreateSession(chatId);
  const tempPath = path.join(os.tmpdir(), `ig-publish-${chatId}-${jobId}.png`);
  await dockerService.copyFromContainer(session.containerId, job.image_path, tempPath);

  const rawBuffer = await fs.readFile(tempPath);
  await fs.unlink(tempPath).catch(() => {});

  // Конвертируем в 1080×1080 JPEG — требование Instagram
  const jpegBuffer = await sharp(rawBuffer)
    .resize(1080, 1080, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 92 })
    .toBuffer();

  const hostDir = path.join(storageService.getDataDir(chatId), 'output', 'content');
  await fs.mkdir(hostDir, { recursive: true });
  const hostFilename = `ig_${jobId}.jpg`;
  await fs.writeFile(path.join(hostDir, hostFilename), jpegBuffer);

  const imageUrl = `${config.APP_URL}/api/files/public/${chatId}/${hostFilename}`;
  let text = String(job.caption || '').slice(0, 2200);

  let publishedId = null;
  let publishMethod = 'buffer';

  if (useMeta) {
    console.log(`[IG-MVP] Publishing 1080x1080 JPEG via Meta Graph, size=${jpegBuffer.length} bytes`);
    const result = await metaGraph.publishPhoto(
      cfg.meta_page_access_token,
      cfg.meta_ig_business_account_id,
      { imageUrl, caption: text }
    );
    publishedId = result.mediaId;
    publishMethod = 'meta';
    console.log(`[IG-MVP] Published via Meta, mediaId=${publishedId}`);

    await igRepo.addPublishLog(chatId, {
      jobId,
      mediaId: publishedId,
      method: 'meta',
      status: 'published',
      correlationId: corrId
    });
    await igRepo.updateJob(chatId, jobId, {
      status: 'published',
      mediaId: publishedId
    });
  } else {
    console.log(`[IG-MVP] Publishing 1080x1080 JPEG via Buffer, size=${jpegBuffer.length} bytes`);
    const bufferResult = await bufferService.createPost(bufferApiKey, bufferChannelId, { text, imageUrl, instagramType: 'post' });
    publishedId = bufferResult.postId;
    console.log(`[IG-MVP] Published via Buffer, postId=${publishedId}`);

    await igRepo.addPublishLog(chatId, {
      jobId,
      bufferPostId: publishedId,
      method: 'buffer',
      status: 'published',
      correlationId: corrId
    });
    await igRepo.updateJob(chatId, jobId, {
      status: 'published',
      bufferPostId: publishedId
    });
  }

  // Обновить статистику
  const stats = cfg.stats || {};
  const today = getNowInTz(SCHEDULE_TZ).date;
  const postsToday = stats.last_post_date === today ? (stats.posts_today || 0) + 1 : 1;
  await manageStore.setInstagramConfig(chatId, {
    stats: {
      total_posts: (stats.total_posts || 0) + 1,
      posts_today: postsToday,
      last_post_date: today
    }
  });

  // Удалить черновик
  await removeDraft(chatId, String(jobId));

  // Уведомление
  if (bot?.telegram) {
    const via = publishMethod === 'meta' ? 'Meta API' : 'Buffer';
    const msg = `📷 Instagram пост опубликован через ${via}!\n${text.slice(0, 100)}...`;
    await bot.telegram.sendMessage(chatId, msg).catch(() => {});
  }

  return { postId: publishedId, method: publishMethod };
}

// ============================================
// Модерация
// ============================================

async function sendIgToModerator(chatId, bot, draft) {
  const igSettings = getIgSettings(chatId);

  const moderatorId = manageStore.getEffectiveModerator(chatId, igSettings);
  console.log(`[IG-MODERATION] Sending draft #${draft.jobId} to moderator ${moderatorId}, chatId=${chatId}`);

  const caption = [
    `📷 Черновик для Instagram #${draft.jobId}`,
    formatDraftMeta(chatId),
    '',
    (draft.caption || '').slice(0, 800),
    '',
    draft.correlationId ? `📋 ${draft.correlationId}` : ''
  ].filter(Boolean).join('\n').slice(0, 1024);

  const callbackBase = `ig_mod:${draft.jobId}`;
  const kb = {
    inline_keyboard: [
      [
        { text: '✅ Одобрить', callback_data: `${callbackBase}:approve` },
        { text: '❌ Отклонить', callback_data: `${callbackBase}:reject` }
      ],
      [
        { text: '🔁 Текст', callback_data: `${callbackBase}:regen_text` },
        { text: '🖼 Фото', callback_data: `${callbackBase}:regen_image` }
      ]
    ]
  };

  if (draft.imagePath) {
    const session = await sessionService.getOrCreateSession(chatId);
    const tempPath = path.join(os.tmpdir(), `ig-mod-${chatId}-${draft.jobId}.png`);
    await dockerService.copyFromContainer(session.containerId, draft.imagePath, tempPath);
    
    // Используем cwBot если он есть и у пользователя нет своего бота
    const moderatorBot = cwBot && cwBot.token !== bot?.token ? cwBot : bot;
    console.log(`[IG-MODERATION] Using bot: ${moderatorBot === cwBot ? 'cwBot' : 'user bot'}, imagePath=${draft.imagePath}`);
    const sent = await safeSendToModerator({
      sendFn: () => moderatorBot.telegram.sendPhoto(moderatorId, { source: tempPath }, { caption, reply_markup: kb }),
      chatId, moderatorId, notifyBot: bot || cwBot
    });
    console.log(`[IG-MODERATION] Draft #${draft.jobId} sent, messageId=${sent?.message_id}`);
    await fs.unlink(tempPath).catch(() => {});

    // Сохраняем Telegram CDN URL — Instagram может скачать его, в отличие от нашего сервера
    if (sent?.photo?.length && moderatorBot?.telegram) {
      try {
        const fileId = sent.photo[sent.photo.length - 1].file_id;
        const fileInfo = await moderatorBot.telegram.getFile(fileId);
        const cwBotToken = process.env.CW_BOT_TOKEN;
        if (fileInfo?.file_path && cwBotToken) {
          const telegramImageUrl = `https://api.telegram.org/file/bot${cwBotToken}/${fileInfo.file_path}`;
          await igRepo.updateJob(chatId, draft.jobId, { telegramImageUrl });
          console.log(`[IG-MODERATION] Telegram image URL saved for job ${draft.jobId}`);
        }
      } catch (e) {
        console.warn(`[IG-MODERATION] Could not get Telegram file URL: ${e.message}`);
      }
    }

    await setDraft(chatId, String(draft.jobId), {
      ...draft,
      moderationMessageId: sent.message_id
    });
  } else {
    // Используем cwBot если он есть и у пользователя нет своего бота
    const moderatorBot = cwBot && cwBot.token !== bot?.token ? cwBot : bot;
    const sent = await safeSendToModerator({
      sendFn: () => moderatorBot.telegram.sendMessage(moderatorId, caption, { reply_markup: kb }),
      chatId, moderatorId, notifyBot: bot || cwBot
    });
    await setDraft(chatId, String(draft.jobId), {
      ...draft,
      moderationMessageId: sent.message_id
    });
  }
}

async function handleInstagramModerationAction(chatId, bot, jobId, action) {
  const draft = getDrafts(chatId)[String(jobId)];
  if (!draft) return { ok: false, message: 'Черновик Instagram-поста не найден.' };

  const correlationId = draft.correlationId || generateCorrelationId();

  if (action === 'approve') {
    try {
      if (draft.isVideo) {
        await publishIgVideoPost(chatId, bot, jobId, correlationId);
        return { ok: true, message: `🎬 Instagram Reels #${jobId} опубликован.` };
      } else {
        await publishIgPost(chatId, bot, jobId, correlationId);
        return { ok: true, message: `📷 Instagram пост #${jobId} опубликован.` };
      }
    } catch (e) {
      await igRepo.addPublishLog(chatId, {
        jobId, status: 'failed',
        errorText: e.message, correlationId
      });
      await igRepo.updateJob(chatId, jobId, { status: 'failed', errorText: e.message });
      return { ok: false, message: `Ошибка публикации Instagram: ${e.message}` };
    }
  }

  if (action === 'regen_text') {
    try {
      const [materialsText, personaText] = await Promise.all([
        loadMaterialsText(chatId, 12),
        loadUserPersona(chatId)
      ]);
      const igText = await generateIgPostText(chatId, draft.topic, materialsText, personaText);
      draft.caption = igText.caption;
      draft.imagePrompt = igText.imagePrompt;
      await igRepo.updateJob(chatId, jobId, {
        caption: igText.caption,
        imagePrompt: igText.imagePrompt
      });
      if (draft.isVideo) {
        await sendIgVideoToModerator(chatId, bot, draft);
      } else {
        await sendIgToModerator(chatId, bot, draft);
      }
      return { ok: true, message: 'Текст Instagram-поста перегенерирован.' };
    } catch (e) {
      return { ok: false, message: `Ошибка перегенерации текста: ${e.message}` };
    }
  }

  if (action === 'regen_image') {
    try {
      const imageBuffer = await generateIgImage(chatId, draft.topic);
      const imagePath = await saveImageToContainer(chatId, imageBuffer, `${jobId}_regen_${Date.now()}`);
      draft.imagePath = imagePath;
      await igRepo.updateJob(chatId, jobId, { imagePath });
      await sendIgToModerator(chatId, bot, draft);
      return { ok: true, message: 'Изображение Instagram-поста перегенерировано.' };
    } catch (e) {
      return { ok: false, message: `Ошибка перегенерации изображения: ${e.message}` };
    }
  }

  if (action === 'reject') {
    if (draft.topic?.sheetRow) {
      await repository.releaseTopic(chatId, draft.topic.sheetRow).catch(() => {});
    }
    await igRepo.updateJob(chatId, jobId, { status: 'failed', errorText: 'Rejected by moderator' });
    await removeDraft(chatId, String(jobId));
    return { ok: true, message: 'Instagram-пост отклонен. Тема освобождена.' };
  }

  return { ok: false, message: 'Неизвестное действие.' };
}

// ============================================
// Генерация Instagram Reels (видео-пайплайн)
// ============================================

async function handleIgVideoGenerateJob(chatId, queueJob, bot, correlationId) {
  console.log(`[IG-REELS-GENERATE] ${chatId} starting reels generation, corr=${correlationId}`);

  await repository.ensureSchema(chatId);
  await igRepo.ensureSchema(chatId);

  const settings = getIgReelsSettings(chatId);

  // Получаем видео из общего пайплайна или генерируем новое
  let videoPath = '';
  let videoId = null;

  try {
    // Сначала пробуем забрать готовое видео из общего пула
    const claimResult = await videoPipeline.claimVideo(chatId, 'instagram');

    if (claimResult.success) {
      videoPath = claimResult.videoPath;
      videoId = claimResult.videoId;
      console.log(`[IG-REELS-GENERATE] ${chatId} using shared video: videoId=${videoId}, path=${videoPath}`);
    } else {
      // Нет доступного видео — генерируем новое
      console.log(`[IG-REELS-GENERATE] ${chatId} no shared video available, generating new one`);

      const genResult = await videoPipeline.generateVideo(chatId, 'instagram', correlationId);
      if (!genResult.success) {
        return { success: false, error: `Video generation failed: ${genResult.error}`, retry: true };
      }

      videoPath = genResult.videoPath;
      videoId = genResult.videoId;
      console.log(`[IG-REELS-GENERATE] ${chatId} new video generated: videoId=${videoId}, path=${videoPath}`);
    }
  } catch (e) {
    console.error(`[IG-REELS-GENERATE] ${chatId} video pipeline failed: ${e.message}`);
    return { success: false, error: `Video pipeline failed: ${e.message}`, retry: true };
  }

  // Используем тему из queueJob
  const topic = queueJob?.topic || { topic: 'Product showcase', focus: '', secondary: '', lsi: '' };

  // Генерация caption + imagePrompt через существующую IG логику
  console.log(`[IG-REELS-GENERATE] ${chatId} generating caption...`);
  let igText;
  try {
    const [materialsText, personaText] = await Promise.all([
      loadMaterialsText(chatId, 12),
      loadUserPersona(chatId)
    ]);
    igText = await generateIgPostText(chatId, topic, materialsText, personaText, 'instagram-reels-copywriter');
    console.log(`[IG-REELS-GENERATE] ${chatId} caption generated (${(igText.caption || '').length} chars)`);
  } catch (e) {
    console.error(`[IG-REELS-GENERATE] ${chatId} caption generation failed: ${e.message}`);
    igText = {
      caption: `${topic.topic} #reels #video`,
      imagePrompt: ''
    };
  }

  // Запись в БД — храним videoPath в image_path для совместимости с igRepo
  const jobId = await igRepo.createJob(chatId, {
    topic: topic.topic,
    caption: igText.caption,
    imagePrompt: igText.imagePrompt || '',
    imagePath: videoPath,
    status: 'ready',
    imageAttempts: 0,
    correlationId
  });

  const draft = {
    jobId,
    videoId,
    videoPath,
    topic,
    caption: igText.caption,
    imagePrompt: igText.imagePrompt || '',
    correlationId,
    rejectedCount: 0,
    isVideo: true
  };

  // Маршрутизация: модерация или автопубликация
  if (!settings.premoderationEnabled) {
    await setDraft(chatId, String(jobId), draft);
    await publishIgVideoPost(chatId, bot, jobId, correlationId);
  } else {
    await sendIgVideoToModerator(chatId, bot, draft);
  }

  return { success: true, data: { jobId, videoId, videoPath } };
}

// ============================================
// Публикация Instagram Reels (видео)
// ============================================

async function publishIgVideoPost(chatId, bot, jobId, correlationId) {
  const corrId = correlationId || generateCorrelationId();
  const job = await igRepo.getJobById(chatId, jobId);
  if (!job) throw new Error(`Instagram Reels job ${jobId} not found`);

  const igCfg = manageStore.getInstagramConfig(chatId) || {};
  const useMeta = igCfg.meta_method === 'meta';

  const reelsCfg = manageStore.getInstagramReelsConfig(chatId) || {};
  const globalInt = manageStore.getIntegrationSettings(chatId) || {};
  const bufferApiKey = globalInt.buffer_api_key || null;
  const bufferChannelId = reelsCfg.buffer_channel_id || null;

  if (!useMeta && (!bufferApiKey || !bufferChannelId)) {
    throw new Error('Buffer API key или channel_id не настроены для Instagram Reels');
  }
  if (useMeta && (!igCfg.meta_page_access_token || !igCfg.meta_ig_business_account_id)) {
    throw new Error('Meta page_access_token или ig_business_account_id не настроены');
  }

  // videoPath хранится в image_path — это путь к временному файлу видео-пайплайна
  const videoPath = job.image_path;
  const videoUrl = videoPath
    ? `${config.APP_URL}/api/video/temp/${chatId}/${path.basename(videoPath)}`
    : null;

  const text = String(job.caption || '').slice(0, 2200);

  let publishedId = null;
  let publishMethod = 'buffer';

  if (useMeta) {
    if (!videoUrl) throw new Error('videoUrl не сформирован для Reels');
    const result = await metaGraph.publishReel(
      igCfg.meta_page_access_token,
      igCfg.meta_ig_business_account_id,
      { videoUrl, caption: text }
    );
    publishedId = result.mediaId;
    publishMethod = 'meta';
    console.log(`[IG-REELS-MVP] Published via Meta, mediaId=${publishedId}`);

    await igRepo.addPublishLog(chatId, {
      jobId,
      mediaId: publishedId,
      method: 'meta',
      status: 'published',
      correlationId: corrId
    });
    await igRepo.updateJob(chatId, jobId, {
      status: 'published',
      mediaId: publishedId
    });
  } else {
    const bufferResult = await bufferService.createPost(
      bufferApiKey,
      bufferChannelId,
      { text, videoUrl, instagramType: 'reel' }
    );
    publishedId = bufferResult.postId;
    console.log(`[IG-REELS-MVP] Published via Buffer, postId=${publishedId}`);

    await igRepo.addPublishLog(chatId, {
      jobId,
      bufferPostId: publishedId,
      method: 'buffer',
      status: 'published',
      correlationId: corrId
    });
    await igRepo.updateJob(chatId, jobId, {
      status: 'published',
      bufferPostId: publishedId
    });
  }

  // Обновить статистику Reels
  const reelsSettings = getIgReelsSettings(chatId);
  const stats = reelsSettings.stats || {};
  const today = getNowInTz(reelsSettings.scheduleTz).date;
  const postsToday = stats.last_post_date === today ? (stats.posts_today || 0) + 1 : 1;
  await manageStore.setInstagramReelsConfig(chatId, {
    stats: {
      total_posts: (stats.total_posts || 0) + 1,
      posts_today: postsToday,
      last_post_date: today
    }
  });

  // Удалить черновик
  await removeDraft(chatId, String(jobId));

  // Уведомление
  if (bot?.telegram) {
    const via = publishMethod === 'meta' ? 'Meta API' : 'Buffer';
    const msg = `🎬 Instagram Reels опубликован через ${via}!\n${text.slice(0, 100)}...`;
    await bot.telegram.sendMessage(chatId, msg).catch(() => {});
  }

  return { postId: publishedId, method: publishMethod };
}

// ============================================
// Модерация Instagram Reels
// ============================================

async function sendIgVideoToModerator(chatId, bot, draft) {
  const igSettings = getIgReelsSettings(chatId);

  const moderatorId = manageStore.getEffectiveModerator(chatId, igSettings);

  const caption = [
    `🎬 Черновик Instagram Reels #${draft.jobId}`,
    formatDraftMeta(chatId),
    '',
    (draft.caption || '').slice(0, 800),
    '',
    draft.correlationId ? `📋 ${draft.correlationId}` : ''
  ].filter(Boolean).join('\n').slice(0, 1024);

  const callbackBase = `ig_mod:${draft.jobId}`;
  const kb = {
    inline_keyboard: [
      [
        { text: '✅ Одобрить', callback_data: `${callbackBase}:approve` },
        { text: '❌ Отклонить', callback_data: `${callbackBase}:reject` }
      ],
      [
        { text: '🔁 Текст', callback_data: `${callbackBase}:regen_text` }
      ]
    ]
  };

  // Используем cwBot если он есть и у пользователя нет своего бота
  const moderatorBot = cwBot && cwBot.token !== bot?.token ? cwBot : bot;

  try {
    const sent = await safeSendToModerator({
      sendFn: async () => {
        if (draft.videoPath) {
          const videoFullPath = path.join(
            require('./videoPipeline.service').VIDEO_TEMP_ROOT || '',
            String(chatId),
            path.basename(draft.videoPath)
          );
          try {
            return await moderatorBot.telegram.sendVideo(moderatorId, { source: videoFullPath }, { caption, reply_markup: kb });
          } catch (e) {
            console.warn(`[IG-REELS-MOD] Cannot send video file, falling back to text: ${e.message}`);
          }
        }
        return await moderatorBot.telegram.sendMessage(moderatorId, caption, { reply_markup: kb });
      },
      chatId, moderatorId, notifyBot: bot || cwBot
    });
    await setDraft(chatId, String(draft.jobId), { ...draft, moderationMessageId: sent.message_id });
  } catch (e) {
    console.error(`[IG-REELS-MOD] Failed to send to moderator: ${e.message}`);
  }
}

// ============================================
// Планировщик Instagram Reels
// ============================================

async function tickIgReelsSchedule(chatId) {
  const settings = getIgReelsSettings(chatId);
  if (!settings.isActive) return;

  const tz = settings.scheduleTz;
  const now = getNowInTz(tz);

  // Дневной лимит через stats
  const stats = settings.stats || {};
  const postsToday = stats.last_post_date === now.date ? (stats.posts_today || 0) : 0;
  if (postsToday >= settings.dailyLimit) return;

  // День недели
  const dayOfWeek = new Date().getDay();
  if (!settings.allowedWeekdays.includes(dayOfWeek)) return;

  const [startH, startM] = (settings.scheduleTime || '14:00').split(':').map(Number);
  const [nowH, nowM] = now.time.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const nowMinutes = nowH * 60 + nowM;

  if (nowMinutes < startMinutes) return;

  if (settings.scheduleEndTime && settings.scheduleEndTime !== '00:00') {
    const [endH, endM] = settings.scheduleEndTime.split(':').map(Number);
    const endMinutes = endH * 60 + endM;
    if (endMinutes > 0 && nowMinutes >= endMinutes) return;
  }

  const intervalMinutes = Math.round((settings.publishIntervalHours || 6) * 60);
  const data = manageStore.getState(chatId) || {};

  if (settings.randomPublish) {
    let currentSlot = -1;
    for (let slot = startMinutes; slot < 24 * 60; slot += intervalMinutes) {
      if (nowMinutes >= slot) currentSlot = slot;
    }
    if (currentSlot < 0) return;

    const slotKey = `igReelsRandomSlot:${currentSlot}`;
    const runKey = `igReelsRandomRun:${currentSlot}`;

    if (data[runKey] === now.date) return;

    const maxJitter = Math.round(intervalMinutes * 0.15);
    let needRegenerate = !data[slotKey] || data[slotKey].split('|')[0] !== now.date;
    if (!needRegenerate && data[slotKey]) {
      const existingTarget = parseInt(data[slotKey].split('|')[1], 10);
      if (existingTarget < currentSlot || existingTarget > currentSlot + maxJitter) needRegenerate = true;
    }
    if (needRegenerate) {
      const randomOffset = Math.floor(Math.random() * (maxJitter + 1));
      data[slotKey] = `${now.date}|${currentSlot + randomOffset}`;
      const states = manageStore.getAllStates();
      if (!states[chatId]) states[chatId] = data;
      await manageStore.persist(chatId);
    }

    const targetMinute = parseInt(data[slotKey].split('|')[1], 10);
    if (nowMinutes < targetMinute) return;

    data[runKey] = now.date;
    const states2 = manageStore.getAllStates();
    if (!states2[chatId]) states2[chatId] = data;
    await manageStore.persist(chatId);
    console.log(`[IG-REELS-SCHEDULE-RANDOM] ${chatId} random time reached ${now.time}, generating reels`);
  } else {
    let isSlot = false;
    for (let slot = startMinutes; slot < 24 * 60; slot += intervalMinutes) {
      if (nowMinutes === slot) { isSlot = true; break; }
    }
    if (!isSlot) return;

    const key = `igReelsLastRun:${now.time}`;
    if (data[key] === now.date) return;
    data[key] = now.date;
    const states = manageStore.getAllStates();
    if (!states[chatId]) states[chatId] = data;
    await manageStore.persist(chatId);
    console.log(`[IG-REELS-SCHEDULE] ${chatId} slot matched ${now.time}, generating reels`);
  }

  // Резервируем тему для instagram_reels
  const topic = await repository.reserveNextTopic(chatId, 'instagram_reels');
  if (!topic) return;

  const bot = botsGetter?.()?.get(chatId);
  if (!bot?.bot) {
    await repository.releaseTopic(chatId, topic.id);
    return;
  }

  let jobResult;
  try {
    jobResult = await handleIgVideoGenerateJob(chatId, { topic }, bot.bot, `ig_reels_schedule_${Date.now()}`);
  } catch (e) {
    await repository.releaseTopic(chatId, topic.id);
    return;
  }
  if (!jobResult?.success) {
    await repository.releaseTopic(chatId, topic.id);
  }
}

async function runNowReels(chatId, bot) {
  await repository.ensureSchema(chatId);
  await igRepo.ensureSchema(chatId);

  const settings = getIgReelsSettings(chatId);
  const stats = settings.stats || {};
  const now = getNowInTz(settings.scheduleTz);
  const postsToday = stats.last_post_date === now.date ? (stats.posts_today || 0) : 0;
  if (postsToday >= settings.dailyLimit) {
    return { ok: false, message: `Дневной лимит Instagram Reels исчерпан (${postsToday}/${settings.dailyLimit}).` };
  }

  const topic = await repository.reserveNextTopic(chatId, 'instagram_reels');
  if (!topic) {
    return { ok: false, message: 'Нет доступных тем для Instagram Reels.' };
  }

  const correlationId = generateCorrelationId();
  try {
    const result = await handleIgVideoGenerateJob(chatId, { topic }, bot, correlationId);
    if (!result?.success) {
      await repository.releaseTopic(chatId, topic.id);
      return { ok: false, message: result?.error || 'Ошибка генерации' };
    }
    return { ok: true, message: 'Instagram Reels: задача создана.', ...result.data };
  } catch (e) {
    await repository.releaseTopic(chatId, topic.id);
    return { ok: false, message: e.message };
  }
}

// ============================================
// Планировщик
// ============================================

async function tickIgSchedule(chatId, bot) {
  const cfg = manageStore.getInstagramConfig(chatId);
  if (!cfg || !cfg.is_active) return;

  const settings = getIgSettings(chatId);
  const tz = settings.scheduleTz;
  const now = getNowInTz(tz);

  // Дневной лимит
  const publishedToday = await igRepo.countPublishedToday(chatId, tz);
  if (publishedToday >= settings.dailyLimit) return;

  // День недели
  const dayOfWeek = new Date().getDay();
  if (!settings.allowedWeekdays.includes(dayOfWeek)) return;

  const [startH, startM] = (settings.scheduleTime || '10:00').split(':').map(Number);
  const [nowH, nowM] = now.time.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const nowMinutes = nowH * 60 + nowM;

  if (settings.scheduleEndTime && settings.scheduleEndTime !== '00:00') {
    const [endH, endM] = settings.scheduleEndTime.split(':').map(Number);
    const endMinutes = endH * 60 + endM;
    if (endMinutes > 0 && nowMinutes >= endMinutes) return;
  }

  const intervalMinutes = Math.round((settings.publishIntervalHours || 4) * 60);

  const data = manageStore.getState(chatId) || {};

  if (settings.randomPublish) {
    // Рандомный режим: при наступлении каждого слота генерируем случайное
    // время следующей публикации в диапазоне 85%-100% от интервала.
    // Слот используется как «окно», внутри которого срабатывает одна публикация.

    // Определяем текущий слот (ближайший прошедший)
    let currentSlot = -1;
    for (let slot = startMinutes; slot < 24 * 60; slot += intervalMinutes) {
      if (nowMinutes >= slot) currentSlot = slot;
    }
    if (currentSlot < 0) return;

    const slotKey = `igRandomSlot:${currentSlot}`;
    const runKey = `igRandomRun:${currentSlot}`;

    // Если в этом слоте сегодня уже публиковали — пропускаем
    if (data[runKey] === now.date) return;

    // Генерируем случайную минуту для этого слота, если ещё не сгенерирована
    // Также пересчитываем если интервал изменился (targetMinute выходит за пределы допустимого диапазона)
    // Смещение 0-15% от интервала: пост выходит близко к началу слота с небольшим разбросом
    const maxJitter = Math.round(intervalMinutes * 0.15);
    let needRegenerate = !data[slotKey] || data[slotKey].split('|')[0] !== now.date;
    if (!needRegenerate && data[slotKey]) {
      const existingTarget = parseInt(data[slotKey].split('|')[1], 10);
      const minAllowed = currentSlot;
      const maxAllowed = currentSlot + maxJitter;
      if (existingTarget < minAllowed || existingTarget > maxAllowed) {
        needRegenerate = true;
      }
    }
    if (needRegenerate) {
      const randomOffset = Math.floor(Math.random() * (maxJitter + 1));
      const targetMinute = currentSlot + randomOffset;
      data[slotKey] = `${now.date}|${targetMinute}`;
      const states = manageStore.getAllStates();
      if (!states[chatId]) states[chatId] = data;
      await manageStore.persist(chatId);
      const tgtH = Math.floor(targetMinute / 60);
      const tgtM = targetMinute % 60;
      console.log(`[IG-SCHEDULE-RANDOM] ${chatId} target set to ${String(tgtH).padStart(2,'0')}:${String(tgtM).padStart(2,'0')} for slot ${currentSlot}`);
    }

    const targetMinute = parseInt(data[slotKey].split('|')[1], 10);

    // Логируем ожидание раз в 10 минут (аналогично фиксированному режиму)
    if (nowMinutes < targetMinute) {
      if (nowMinutes % 10 === 0) {
        const tgtH = Math.floor(targetMinute / 60);
        const tgtM = targetMinute % 60;
        console.log(`[IG-SCHEDULE-RANDOM] ${chatId} waiting: now=${now.time}, target=${String(tgtH).padStart(2,'0')}:${String(tgtM).padStart(2,'0')}, interval=${settings.publishIntervalHours}h`);
      }
      return;
    }

    // Время наступило — публикуем
    data[runKey] = now.date;
    const states2 = manageStore.getAllStates();
    if (!states2[chatId]) states2[chatId] = data;
    await manageStore.persist(chatId);

    console.log(`[IG-SCHEDULE-RANDOM] ${chatId} random time reached ${now.time}, enqueueing ig_generate`);
  } else {
    // Фиксированный режим: публикация строго по слотам
    let isSlot = false;
    for (let slot = startMinutes; slot < 24 * 60; slot += intervalMinutes) {
      if (nowMinutes === slot) { isSlot = true; break; }
    }
    if (!isSlot) {
      if (nowMinutes % 10 === 0) {
        console.log(`[IG-SCHEDULE] ${chatId} waiting: now=${now.time}, start=${settings.scheduleTime}, interval=${settings.publishIntervalHours}h`);
      }
      return;
    }

    const key = `igLastRun:${now.time}`;
    if (data[key] === now.date) return;

    data[key] = now.date;
    const states = manageStore.getAllStates();
    if (!states[chatId]) states[chatId] = data;
    await manageStore.persist(chatId);

    console.log(`[IG-SCHEDULE] ${chatId} slot matched ${now.time}, enqueueing ig_generate`);
  }

  await queueRepo.ensureQueueSchema(chatId);
  await queueRepo.enqueue(chatId, {
    jobType: 'ig_generate',
    priority: 0,
    payload: { reason: 'schedule' },
    correlationId: generateCorrelationId()
  });
}

async function runNow(chatId, bot, reason = 'manual') {
  await repository.ensureSchema(chatId);
  await igRepo.ensureSchema(chatId);

  const settings = getIgSettings(chatId);
  const publishedToday = await igRepo.countPublishedToday(chatId, settings.scheduleTz);
  if (publishedToday >= settings.dailyLimit) {
    return { ok: false, message: `Дневной лимит Instagram-постов исчерпан (${publishedToday}/${settings.dailyLimit}).` };
  }

  const correlationId = generateCorrelationId();

  await queueRepo.ensureQueueSchema(chatId);
  const queueJobId = await queueRepo.enqueue(chatId, {
    jobType: 'ig_generate',
    priority: 0,
    payload: { reason },
    correlationId
  });

  return { ok: true, message: `Instagram-задача #${queueJobId} в очереди.`, queueJobId, correlationId };
}

// ============================================
// Scheduler & Worker Registration
// ============================================

function startScheduler(getBots) {
  botsGetter = getBots;

  // Регистрируем обработчики задач Instagram
  worker.registerJobHandler('ig_generate', handleIgGenerateJob);
  worker.registerJobHandler('ig_publish', async (chatId, queueJob, bot, correlationId) => {
    const jobId = queueJob.job_id || queueJob.payload?.jobId;
    if (!jobId) return { success: false, error: 'No jobId', retry: false };
    try {
      await publishIgPost(chatId, bot, jobId, correlationId);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message, retry: true };
    }
  });

  // Запускаем worker с поддержкой CW_BOT_TOKEN
  worker.startWorker(getBots, () => cwBot);

  // Планировщик Instagram (раз в минуту)
  if (schedulerHandle) clearInterval(schedulerHandle);
  schedulerHandle = setInterval(async () => {
    try {
      const bots = getBots();
      for (const [chatId, entry] of bots.entries()) {
        try {
          await tickIgSchedule(chatId, entry.bot);
        } catch (e) {
          console.error(`[IG-MVP-SCHEDULER] Error for ${chatId}:`, e.message);
        }
        try {
          await tickIgReelsSchedule(chatId);
        } catch (e) {
          console.error(`[IG-MVP-SCHEDULER-REELS] Error for ${chatId}:`, e.message);
        }
      }
    } catch (e) {
      console.error('[IG-MVP-SCHEDULER]', e.message);
    }
  }, 60 * 1000);

  console.log('[IG-MVP] Scheduler and worker started');
}

function stopScheduler() {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
  console.log('[IG-MVP] Scheduler stopped');
}

// ============================================
// Exports
// ============================================

module.exports = {
  startScheduler,
  stopScheduler,
  runNow,
  handleIgGenerateJob,
  handleIgVideoGenerateJob,
  publishIgPost,
  publishIgVideoPost,
  sendIgToModerator,
  sendIgVideoToModerator,
  handleInstagramModerationAction,
  tickIgSchedule,
  tickIgReelsSchedule,
  runNowReels,
  getIgSettings,
  getIgReelsSettings,
  listJobs: (chatId, opts) => igRepo.listJobs(chatId, opts),
  getJobById: (chatId, jobId) => igRepo.getJobById(chatId, jobId),
  setIgCwBot: (bot) => { cwBot = bot; },
  getIgCwBot: () => cwBot
};
