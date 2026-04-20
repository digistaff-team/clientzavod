/**
 * Blog Generator Service — генерация статей для WordPress/Дзен
 * Prompt chain: формат → промпт картинки → imageGen → статья → SEO
 */
const config = require('../config');
const aiRouterService = require('./ai_router_service');
const inputImageContext = require('./inputImageContext.service');
const manageStore = require('../manage/store');
const wpRepo = require('./content/wordpress.repository');
const contentRepo = require('./content/repository');

// Промпты вынесены в manage/prompts.js, импортируем отсюда
const {
  BLOG_PROMPT_FORMAT,
  BLOG_PROMPT_IMAGE,
  BLOG_PROMPT_WRITE,
  BLOG_PROMPT_SEO_TITLE,
  BLOG_PROMPT_SEO_DESC,
  BLOG_PROMPT_SEO_SLUG
} = require('../manage/prompts');
const channelSkills = require('./channelSkills');


/**
 * Загрузить технический документ из базы знаний
 */
async function loadKnowledge(chatId, techDocId) {
  if (!techDocId) return null;

  return contentRepo.withClient(chatId, async (client) => {
    const result = await client.query(
      'SELECT title, body, tags FROM content_knowledge_base WHERE id = $1',
      [techDocId]
    );
    return result.rows[0] || null;
  });
}

/**
 * Вызвать AI router с проверкой баланса
 */
async function aiChat(chatId, systemPrompt, userPrompt) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  const result = await aiRouterService.callAI(chatId, null, null, messages, null, null);
  return result?.choices?.[0]?.message?.content || '';
}

/**
 * Основная функция генерации статьи
 * @param {string} chatId
 * @param {object} params
 * @param {string} params.topic — тема статьи
 * @param {string} params.keywords — ключевые слова (через запятую)
 * @param {number} [params.techDocId] — ID технического документа (опционально)
 * @param {string} [params.moderatorNote] — заметки модератора (для rewrite)
 * @returns {Promise<{bodyHtml: string, seoTitle: string, metaDesc: string, slug: string, imageBuffer: Buffer, imageMime: string, imageFilename: string}>}
 */
async function generate(chatId, { topic, keywords, techDocId, moderatorNote }) {
  // 1. Загрузка базы знаний (если указана)
  const knowledgeDoc = await loadKnowledge(chatId, techDocId);
  const knowledgeContext = knowledgeDoc
    ? `=== ТЕХНИЧЕСКИЙ ДОКУМЕНТ ===\nНазвание: ${knowledgeDoc.title}\nСодержимое:\n${knowledgeDoc.body}\nТеги: ${knowledgeDoc.tags || 'нет'}\n\n`
    : '';

  // Заметки модератора (для rewrite)
  const moderatorNoteSection = moderatorNote
    ? `\n=== ЗАМЕЧАНИЯ МОДЕРАТОРА (ОБЯЗАТЕЛЬНО УЧТИ) ===\n${moderatorNote}\n\n`
    : '';

  // 2. Format: определяем структуру статьи
  const formatResult = await aiChat(
    chatId,
    BLOG_PROMPT_FORMAT,
    `Тема: ${topic}\nКлючевые слова: ${keywords}${moderatorNoteSection}`
  );

  // Парсим JSON из ответа
  let formatData;
  try {
    // Ищем JSON в ответе
    const jsonMatch = formatResult.match(/\{[\s\S]*\}/);
    formatData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch (err) {
    console.warn('[BLOG-GEN] Failed to parse format JSON, using defaults:', err.message);
    formatData = {
      target_audience: 'широкая аудитория',
      structure: 'введение, основная часть, заключение'
    };
  }

  // 3. Image prompt: генерируем промпт для обложки
  const imagePromptText = await aiChat(
    chatId,
    BLOG_PROMPT_IMAGE,
    `Структура статьи:\n${JSON.stringify(formatData, null, 2)}\nТема: ${topic}`
  );

  // 4. Генерация изображения (с референсом из /workspace/input если есть)
  const imageModel = manageStore.getImageGenSettings(chatId).model;
  let imageBuffer = null;
  try {
    imageBuffer = await inputImageContext.generateImage(chatId, imagePromptText.trim(), '16:9', imageModel, 'wordpress');
  } catch (imgErr) {
    if (imgErr.name === 'InsufficientBalanceError' || imgErr.name === 'KieDailyLimitError') {
      throw imgErr;
    }
    console.warn(`[BLOG-GENERATOR] Image generation failed, continuing without image: ${imgErr.message}`);
  }

  // 5. Генерация статьи в HTML
  const blogWritePrompt = await channelSkills.buildSystemPrompt('blog-copywriter', BLOG_PROMPT_WRITE);
  const articleHtml = await aiChat(
    chatId,
    blogWritePrompt,
    `Структура: ${JSON.stringify(formatData, null, 2)}\n${knowledgeContext}Тема: ${topic}\nКлючевые слова: ${keywords}${moderatorNoteSection}Правила SEO: используй ключевые слова естественно, добавь H2/H3 подзаголовки, списки где уместно`
  );

  // 6. SEO: параллельно генерируем title, description, slug
  const [seoTitle, metaDesc, slug] = await Promise.all([
    aiChat(chatId, BLOG_PROMPT_SEO_TITLE, `Тема: ${topic}\nКлючевые слова: ${keywords}`),
    aiChat(chatId, BLOG_PROMPT_SEO_DESC, `Тема: ${topic}\nСтатья:\n${articleHtml.substring(0, 2000)}`),
    aiChat(chatId, BLOG_PROMPT_SEO_SLUG, `Тема: ${topic}`)
  ]);

  // Очищаем slug от лишних символов
  const cleanSlug = slug.trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 100) || topic.toLowerCase().replace(/\s+/g, '-').substring(0, 100);

  return {
    bodyHtml: articleHtml.trim(),
    seoTitle: seoTitle.trim().substring(0, 70), // SEO title limit
    metaDesc: metaDesc.trim().substring(0, 160), // Meta description limit
    slug: cleanSlug,
    imageBuffer: imageBuffer,
    imageMime: 'image/jpeg',
    imageFilename: 'cover.jpg'
  };
}

module.exports = { generate };
