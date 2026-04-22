'use strict';

const path = require('path');
const fetch = require('node-fetch');
const sessionService = require('./session.service');
const dockerService = require('./docker.service');
const config = require('../config');
const vpRepo = require('./content/videoPipeline.repository');

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const TEXT_EXTS = new Set(['.txt', '.md']);

/**
 * Чистая функция: разбирает список файлов и возвращает контекст.
 * Экспортируется для тестирования.
 * Ищет конкретно файл imageprompt.txt для текстового контекста.
 * @param {Array<{name: string, ext: string}>} files
 * @param {Map<string, string>} textContents  имя файла → содержимое
 * @returns {{ textPrompt: string|null, imageFile: string|null }}
 */
function _parseFiles(files, textContents) {
  let textPrompt = null;

  // Ищем конкретно imageprompt.txt (case-insensitive)
  const imagePromptFile = files.find(f => f.name.toLowerCase() === 'imageprompt.txt');
  if (imagePromptFile) {
    const content = textContents.get(imagePromptFile.name);
    if (content && content.trim()) {
      textPrompt = content.trim().slice(0, 500);
    }
  }

  const imageFiles = files.filter(f => IMAGE_EXTS.has(f.ext));
  const imageFile = imageFiles.length > 0
    ? imageFiles[Math.floor(Math.random() * imageFiles.length)].name
    : null;

  return { textPrompt, imageFile };
}

async function _getInputFiles(chatId) {
  try {
    const session = await sessionService.getOrCreateSession(chatId);
    const result = await dockerService.executeInContainer(
      session.containerId,
      "find /workspace/input -maxdepth 1 -type f -printf '%p\\n' 2>/dev/null"
    );
    return result.stdout.trim().split('\n').filter(Boolean).map(filepath => ({
      path: filepath,
      name: path.basename(filepath),
      ext: path.extname(filepath).toLowerCase()
    }));
  } catch (e) {
    console.warn(`[IMAGE-CTX] getInputFiles error for ${chatId}: ${e.message}`);
    return [];
  }
}

async function _readFileContent(chatId, filepath) {
  try {
    const session = await sessionService.getOrCreateSession(chatId);
    const result = await dockerService.executeInContainer(
      session.containerId,
      `cat "${filepath.replace(/"/g, '\\"')}"`
    );
    return result.stdout;
  } catch (e) {
    console.warn(`[IMAGE-CTX] readFileContent error ${filepath}: ${e.message}`);
    return null;
  }
}

/**
 * Читает /workspace/input пользователя и возвращает контекст для генерации.
 * Ищет конкретно файл imageprompt.txt для текстового контекста.
 * @param {string} chatId
 * @returns {Promise<{ textPrompt: string|null, imageFile: string|null }>}
 */
async function getInputContext(chatId) {
  const files = await _getInputFiles(chatId);
  if (files.length === 0) return { textPrompt: null, imageFile: null };

  let textPrompt = null;

  // Ищем конкретно imageprompt.txt
  const imagePromptFile = files.find(f => f.name.toLowerCase() === 'imageprompt.txt');
  if (imagePromptFile) {
    const content = await _readFileContent(chatId, imagePromptFile.path);
    if (content && content.trim()) {
      textPrompt = content.trim().slice(0, 500);
    }
  }

  // Выбираем случайное изображение из доступных
  const imageFiles = files.filter(f => IMAGE_EXTS.has(f.ext));
  const imageFile = imageFiles.length > 0
    ? imageFiles[Math.floor(Math.random() * imageFiles.length)].name
    : null;

  return { textPrompt, imageFile };
}

// Схемы i2i по моделям: поле для изображения + дополнительные обязательные параметры
const I2I_SCHEMAS = {
  'nano-banana-2':             { imageField: 'image_input' },
  'seedream/4.5-edit':         { imageField: 'image_urls',  extra: { quality: 'basic' } },
  'flux-2/pro-image-to-image': { imageField: 'input_urls',  extra: { resolution: '1K' } },
};
const I2I_DEFAULT_SCHEMA = { imageField: 'imageUrls' };

// Модели, которые не поддерживают t2i — при отсутствии фото используем fallback
const I2I_ONLY_MODELS = new Set(['flux-2/pro-image-to-image', 'seedream/4.5-edit', 'nano-banana-2']);

/**
 * Image-to-image через /api/v1/jobs/createTask.
 * Каждая модель использует свой формат поля для референсного изображения:
 * - grok-imagine/text-to-image → imageUrls: [url]
 * - nano-banana-2              → image_input: [url]
 * - seedream/4.5-edit          → image_urls: [url], quality: 'basic'
 */
async function _generateI2I(prompt, imagePublicUrl, aspectRatio, model) {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error('KIE_API_KEY is not set');

  const schema = I2I_SCHEMAS[model] || I2I_DEFAULT_SCHEMA;
  const input = {
    prompt: prompt.slice(0, 800),
    aspect_ratio: aspectRatio,
    nsfw_checker: true,
    ...(schema.extra || {}),
    [schema.imageField]: [imagePublicUrl]
  };

  const createResp = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
    timeout: 30000
  });

  if (!createResp.ok) {
    if (createResp.status === 402) {
      const balanceErr = new Error('KIE.ai insufficient balance (402)');
      balanceErr.name = 'InsufficientBalanceError';
      throw balanceErr;
    }
    const errText = await createResp.text();
    throw new Error(`KIE i2i createTask failed: ${createResp.status} ${errText.slice(0, 300)}`);
  }
  const createData = await createResp.json();
  if (createData.code !== 200) throw new Error(`KIE i2i error: ${createData.msg}`);
  const taskId = createData?.data?.taskId;
  if (!taskId) throw new Error('KIE i2i: no taskId');

  const pollUrl = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`;
  const pollHeaders = { Authorization: `Bearer ${apiKey}` };

  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise(r => setTimeout(r, 8000));
    const pollResp = await fetch(pollUrl, { headers: pollHeaders, timeout: 15000 });
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    const state = pollData?.data?.state;
    if (state === 'success') {
      const resultJson = JSON.parse(pollData.data.resultJson || '{}');
      const imageUrl = resultJson?.resultUrls?.[0];
      if (!imageUrl) throw new Error('KIE i2i: no result URL');
      const imgResp = await fetch(imageUrl, { timeout: 30000 });
      if (!imgResp.ok) throw new Error(`KIE i2i download failed: ${imgResp.status}`);
      return await imgResp.buffer();
    }
    if (state === 'fail') {
      throw new Error(`KIE i2i failed: ${pollData.data.failMsg || 'unknown'}`);
    }
  }
  throw new Error('KIE i2i timeout');
}

/**
 * Text-to-image через /api/v1/jobs/createTask
 */
// Дополнительные обязательные параметры для t2i по моделям
const T2I_EXTRAS = {};

async function _generateT2I(prompt, aspectRatio, model) {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error('KIE_API_KEY is not set');

  const input = {
    prompt: prompt.slice(0, 800),
    aspect_ratio: aspectRatio,
    nsfw_checker: true,
    ...(T2I_EXTRAS[model] || {})
  };

  const createResp = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
    timeout: 30000
  });
  if (!createResp.ok) {
    if (createResp.status === 402) {
      const balanceErr = new Error('KIE.ai insufficient balance (402)');
      balanceErr.name = 'InsufficientBalanceError';
      throw balanceErr;
    }
    const errText = await createResp.text();
    throw new Error(`Image t2i createTask failed: ${createResp.status} ${errText.slice(0, 300)}`);
  }
  const createData = await createResp.json();
  if (createData.code !== 200) throw new Error(`Image t2i error: ${createData.msg}`);
  const taskId = createData?.data?.taskId;
  if (!taskId) throw new Error('Image t2i: no taskId');

  const pollUrl = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`;
  const pollHeaders = { Authorization: `Bearer ${apiKey}` };

  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise(r => setTimeout(r, 8000));
    const pollResp = await fetch(pollUrl, { headers: pollHeaders, timeout: 15000 });
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    const state = pollData?.data?.state;
    if (state === 'success') {
      const resultJson = JSON.parse(pollData.data.resultJson || '{}');
      const imageUrl = resultJson?.resultUrls?.[0];
      if (!imageUrl) throw new Error('Image t2i: no result URL');
      const imgResp = await fetch(imageUrl, { timeout: 30000 });
      if (!imgResp.ok) throw new Error(`Image download failed: ${imgResp.status}`);
      return await imgResp.buffer();
    }
    if (state === 'fail') {
      throw new Error(`Image t2i failed: ${pollData.data.failMsg || 'unknown'}`);
    }
  }
  throw new Error('Image t2i timeout');
}

/**
 * @param {string} productContext - описание товара или тема поста (из .txt файла или basePrompt канала)
 * @param {object|null} interior  - { style, description } из таблицы interiors, или null
 * @returns {string}
 */
function _buildPrompt(productContext, interior) {
  const parts = ['Professional product photography'];

  if (interior) {
    const style = interior.style || 'modern interior';
    const desc = String(interior.description || '').trim();
    parts.push(`Interior: ${style}${desc ? `, ${desc}` : ''}`);
  }

  parts.push(productContext);

  parts.push('no text, no logos, no watermarks');
  parts.push('photorealistic, commercial photography, 4K');

  return parts.join('. ').slice(0, 800);
}

/**
 * Генерирует изображение: i2i если в /workspace/input есть картинка, иначе t2i.
 * Структурированный промпт: интерьер из БД + товар (textPrompt из .txt или basePrompt канала).
 * При i2i: textPrompt из .txt/.md используется как описание товара, не заменяет весь промпт.
 * При сбое i2i — fallback на t2i.
 *
 * @param {string} chatId
 * @param {string} basePrompt  - промпт канала (topic-based)
 * @param {string} aspectRatio - '1:1' | '2:3'
 * @param {string} t2iModel    - модель для t2i ('nano-banana-2' | 'grok-imagine/text-to-image')
 * @param {string} [channel]   - название канала для логов (telegram, vk, wordpress, ...)
 * @returns {Promise<Buffer>}
 */
async function generateImage(chatId, basePrompt, aspectRatio, t2iModel, channel = 'unknown') {
  const tag = `[IMAGE-CTX][${channel}][${chatId}]`;

  // [П4] Pre-flight: проверяем дневной лимит вызовов KIE.ai
  const KIE_DAILY_LIMIT = parseInt(process.env.KIE_DAILY_LIMIT || '30', 10);
  const kieUsageRepo = require('./content/kieUsage.repository');
  try {
    await kieUsageRepo.ensureKieUsageSchema(chatId);
    const count = await kieUsageRepo.incrementAndGetKieCallCount(chatId);
    if (count > KIE_DAILY_LIMIT) {
      await kieUsageRepo.decrementKieCallCount(chatId); // откат оптимистичного инкремента
      const limitErr = new Error(`KIE.ai daily limit reached: ${count - 1}/${KIE_DAILY_LIMIT}`);
      limitErr.name = 'KieDailyLimitError';
      throw limitErr;
    }
    console.log(`${tag} KIE daily usage: ${count}/${KIE_DAILY_LIMIT}`);
  } catch (e) {
    if (e.name === 'KieDailyLimitError') throw e;
    console.warn(`${tag} KIE usage tracking failed (non-blocking): ${e.message}`);
    // Если трекинг упал по технической причине — не блокируем вызов (fail-open)
  }

  const [{ textPrompt, imageFile }, interior] = await Promise.all([
    getInputContext(chatId),
    vpRepo.ensureSchema(chatId)
      .then(() => vpRepo.getRandomInterior(chatId))
      .catch(e => { console.warn(`${tag} Interior fetch skipped: ${e.message}`); return null; })
  ]);

  const productContext = textPrompt || basePrompt;
  const prompt = _buildPrompt(productContext, interior);
  console.log(`${tag} requestedModel=${t2iModel} hasInputFile=${!!imageFile} hasInterior=${!!interior}`);

  if (imageFile && I2I_SCHEMAS[t2iModel]) {
    const imagePublicUrl = `${config.APP_URL}/api/video/input/${chatId}/${encodeURIComponent(imageFile)}`;
    console.log(`${tag} mode=i2i model=${t2iModel} file=${imageFile}`);
    try {
      const result = await _generateI2I(prompt, imagePublicUrl, aspectRatio, t2iModel);
      console.log(`${tag} i2i SUCCESS model=${t2iModel}`);
      return result;
    } catch (e) {
      if (e.name === 'InsufficientBalanceError') throw e;
      console.warn(`${tag} i2i FAILED (${e.message}), falling back to t2i`);
    }
  }

  const effectiveT2iModel = I2I_ONLY_MODELS.has(t2iModel) ? 'grok-imagine/text-to-image' : t2iModel;
  const reason = !imageFile ? 'no-input-file' : !I2I_SCHEMAS[t2iModel] ? 'model-no-i2i' : 'i2i-failed';
  console.log(`${tag} mode=t2i model=${effectiveT2iModel} reason=${reason}`);
  return await _generateT2I(prompt, aspectRatio, effectiveT2iModel);
}

/**
 * Генерирует изображение с полным контекстом из /workspace/input
 *
 * Алгоритм:
 * 1. Загружает контекст из /workspace/input (случайное изображение + текстовый файл)
 * 2. Загружает случайный интерьер из БД (video_assets.interiors)
 * 3. Приоритизирует: textPrompt из файла > fallbackPrompt (LLM/Topic)
 * 4. Строит финальный промпт через _buildPrompt()
 * 5. Выбирает режим: i2i если есть исходное изображение, иначе t2i
 *
 * @param {string} chatId
 * @param {object} topic - { topic, focus, secondary, lsi } - данные темы для логирования
 * @param {string} fallbackPrompt - резервный промпт (LLM imagePrompt или Topic:...)
 * @param {string} aspectRatio - '1:1', '2:3', '1.91:1', '16:9'
 * @param {string} channel - название канала для логов
 * @returns {Promise<Buffer>} - image buffer
 */
async function generateImageWithFullContext(chatId, topic, fallbackPrompt, aspectRatio, channel = 'unknown') {
  const tag = `[IMAGE-FULL-CTX][${channel}][${chatId}]`;

  // Pre-flight: проверяем дневной лимит вызовов KIE.ai
  const KIE_DAILY_LIMIT = parseInt(process.env.KIE_DAILY_LIMIT || '30', 10);
  const kieUsageRepo = require('./content/kieUsage.repository');
  try {
    await kieUsageRepo.ensureKieUsageSchema(chatId);
    const count = await kieUsageRepo.incrementAndGetKieCallCount(chatId);
    if (count > KIE_DAILY_LIMIT) {
      await kieUsageRepo.decrementKieCallCount(chatId);
      const limitErr = new Error(`KIE.ai daily limit reached: ${count - 1}/${KIE_DAILY_LIMIT}`);
      limitErr.name = 'KieDailyLimitError';
      throw limitErr;
    }
    console.log(`${tag} KIE daily usage: ${count}/${KIE_DAILY_LIMIT}`);
  } catch (e) {
    if (e.name === 'KieDailyLimitError') throw e;
    console.warn(`${tag} KIE usage tracking failed (non-blocking): ${e.message}`);
  }

  // 1. Загружаем контекст из /input/ и интерьер из БД параллельно
  const [{ textPrompt, imageFile }, interior] = await Promise.all([
    getInputContext(chatId),
    vpRepo.ensureSchema(chatId)
      .then(() => vpRepo.getRandomInterior(chatId))
      .catch(e => {
        console.warn(`${tag} Interior fetch skipped: ${e.message}`);
        return null;
      })
  ]);

  // 2. Приоритизируем контекст: файл > fallback
  const productContext = textPrompt || fallbackPrompt;
  const prompt = _buildPrompt(productContext, interior);

  console.log(`${tag} topic=${topic.topic || 'unknown'} hasInputFile=${!!imageFile} hasInterior=${!!interior} hasTextFromFile=${!!textPrompt}`);

  // Получаем модель из manageStore
  const manageStore = require('../manage/store');
  const imageModel = manageStore.getImageGenSettings(chatId).model;

  // 3. Выбираем режим генерации: i2i если есть файл и модель его поддерживает
  if (imageFile && I2I_SCHEMAS[imageModel]) {
    const imagePublicUrl = `${config.APP_URL}/api/video/input/${chatId}/${encodeURIComponent(imageFile)}`;
    console.log(`${tag} mode=i2i model=${imageModel} file=${imageFile}`);
    try {
      const result = await _generateI2I(prompt, imagePublicUrl, aspectRatio, imageModel);
      console.log(`${tag} i2i SUCCESS`);
      return result;
    } catch (e) {
      if (e.name === 'InsufficientBalanceError') throw e;
      console.warn(`${tag} i2i FAILED (${e.message}), falling back to t2i`);
    }
  }

  // 4. Fallback на t2i если нет файла или i2i не поддерживается
  const effectiveT2iModel = I2I_ONLY_MODELS.has(imageModel) ? 'grok-imagine/text-to-image' : imageModel;
  const reason = !imageFile ? 'no-input-file' : !I2I_SCHEMAS[imageModel] ? 'model-no-i2i' : 'i2i-failed';
  console.log(`${tag} mode=t2i model=${effectiveT2iModel} reason=${reason}`);
  return await _generateT2I(prompt, aspectRatio, effectiveT2iModel);
}

module.exports = {
  getInputContext,
  generateImage,
  generateImageWithFullContext,
  _parseFiles,
  _buildPrompt,
  I2I_SCHEMAS
};
