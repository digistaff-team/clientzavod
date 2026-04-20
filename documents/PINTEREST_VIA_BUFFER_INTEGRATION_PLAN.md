# АГЕНТНЫЙ ПЛАН: Рефакторинг публикации Pinterest → Buffer API

> **Для AI-агента:** Выполняй фазы строго последовательно.
> После каждой фазы — заполни шаблон отчёта и **добавь** его в этот документ
> в раздел с соответствующей фазой (append, не перезаписывай весь файл).
> Если шаг завершился ошибкой — запиши причину в отчёт и **остановись**.

---

## Контекст

Текущая публикация в Pinterest идёт напрямую через Pinterest API v5
(`services/pinterest.service.js`): изображение кодируется в base64 и передаётся
в `POST /v5/pins`.

Пользователь хочет публиковать через Buffer.com: у него есть аккаунт Buffer
с подключённым Pinterest-каналом и API-ключ GraphQL API.

Buffer API принимает изображение как **публичный URL**, а не base64.
Это ключевое ограничение — сгенерированные картинки хранятся внутри
Docker-контейнеров, поэтому нужен новый публичный HTTP-endpoint для их отдачи.

Логика генерации контента, модерации и расписания **не меняется** — только
слой публикации.

Аналогичный паттерн уже реализован для Instagram в
`documents/INSTAGRAM_BUFFER_SETUP.md` — используй его как образец.

---

## Статус фаз

| Фаза | Описание | Статус |
|------|----------|--------|
| 0 | Подготовка документа | ⬜ |
| 1 | Публичный endpoint для изображений | ⬜ |
| 2 | Сервис Buffer API | ⬜ |
| 3 | Расширение pinterestConfig в store | ⬜ |
| 4 | Расширение POST /channels/pinterest | ⬜ |
| 5 | Условная логика publishPin() | ⬜ |
| 6 | Интеграционное тестирование | ⬜ |

---

## ФАЗА 0: Подготовка документа плана

### Шаг 0.1 — Убедиться что документ плана создан

Документ создан. Статус обновлён.

### Шаг 0.2 — Переход к Фазе 1

Фаза 0 готова.

---

## ФАЗА 1: Публичный endpoint для изображений

### Контекст

Pinterest-изображения генерируются внутри Docker-контейнера и сохраняются по пути
`/workspace/output/content/pin_{jobId}.png`. На хосте этот путь доступен через bind-mount:
`/var/sandbox-data/{sanitized_chatId}/output/content/pin_{jobId}.png`.

`storageService.getDataDir(chatId)` возвращает `/var/sandbox-data/{sanitized_chatId}`.

Buffer API требует **публичный HTTPS URL** изображения. Значит нужен endpoint без авторизации.

Итоговый URL: `https://clientzavod.ru/api/files/public/{chatId}/pin_{jobId}.png`

### Шаги для выполнения

1. Прочитать конец файла `routes/files.routes.js` (найти `module.exports = router;`)
2. Добавить маршрут `GET /public/:chatId/:filename` перед экспортом
3. Проверить что маршрут зарегистрирован в `routes/index.js` (уже должен быть)
4. Добавить отчёт о завершении фазы

### Код маршрута для добавления

```javascript
// Публичный endpoint для Buffer/внешних сервисов — без авторизации
// Отдаёт сгенерированные изображения из output/content пользователя
router.get('/public/:chatId/:filename', async (req, res) => {
    const { chatId, filename } = req.params;

    // Защита от path traversal
    if (!filename || filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    // Разрешаем только изображения
    const ext = path.extname(filename).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
        return res.status(400).json({ error: 'Only image files allowed' });
    }

    const dataDir = storageService.getDataDir(chatId);
    const filePath = path.join(dataDir, 'output', 'content', filename);

    try {
        await fs.access(filePath);
        const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        const fileBuffer = await fs.readFile(filePath);
        res.send(fileBuffer);
    } catch (e) {
        res.status(404).json({ error: 'Image not found' });
    }
});
```

---

## ФАЗА 2: Сервис Buffer GraphQL API

### Контекст

Buffer предоставляет GraphQL API: `POST https://api.buffer.com/graphql`.
Авторизация: `Authorization: Bearer {apiKey}`.

Мутация для создания поста использует переменные:
- `channelId` — ID канала Pinterest в Buffer
- `text` — текст поста
- `schedulingType: "automatic"` — автоматический режим
- `mode: "shareNow"` — публиковать немедленно
- `assets.images[0].url` — публичный URL изображения

### Файл для создания: `services/buffer.service.js`

```javascript
/**
 * Buffer GraphQL API — публикация через Buffer.com
 * Используется для Pinterest (и Instagram).
 * Документация: https://developers.buffer.com/guides/getting-started.html
 */
const fetch = require('node-fetch');

const BUFFER_GRAPHQL_URL = 'https://api.buffer.com/graphql';

/**
 * Создаёт пост в Buffer (режим shareNow).
 * @param {string} apiKey - Bearer токен Buffer API
 * @param {string} channelId - ID канала в Buffer (Pinterest/Instagram channel)
 * @param {object} options
 * @param {string} options.text - Текст поста
 * @param {string} options.imageUrl - Публичный URL изображения
 * @returns {Promise<{postId: string}>}
 * @throws {Error} если Buffer вернул ошибку
 */
async function createPost(apiKey, channelId, { text, imageUrl }) {
  const query = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        post {
          id
          status
        }
        errors {
          message
          code
        }
      }
    }
  `;

  const variables = {
    input: {
      channelId,
      text,
      schedulingType: 'automatic',
      mode: 'shareNow',
      assets: {
        images: [{ url: imageUrl }]
      }
    }
  };

  const response = await fetch(BUFFER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Buffer API HTTP error ${response.status}: ${body}`);
  }

  const data = await response.json();

  // GraphQL ошибки на уровне схемы
  if (data.errors && data.errors.length > 0) {
    const msg = data.errors.map((e) => e.message).join('; ');
    throw new Error(`Buffer GraphQL error: ${msg}`);
  }

  // MutationError внутри ответа
  const mutationErrors = data?.data?.createPost?.errors;
  if (mutationErrors && mutationErrors.length > 0) {
    const msg = mutationErrors.map((e) => e.message).join('; ');
    throw new Error(`Buffer createPost error: ${msg}`);
  }

  const postId = data?.data?.createPost?.post?.id;
  if (!postId) {
    throw new Error('Buffer createPost: no post id in response');
  }

  return { postId };
}

module.exports = { createPost };
```

---

## ФАЗА 3: Расширение pinterestConfig в manage/store.js

### Контекст

Функция `setPinterestConfig` в `manage/store.js` (строка ~567) принимает `patch`
и обновляет конкретные поля. Нужно добавить три новых поля:
- `buffer_api_key` — Bearer токен Buffer API
- `buffer_channel_id` — ID канала Pinterest в Buffer
- `publish_mode` — `'direct'` (по умолчанию) или `'buffer'`

### Где добавить

После строки:
```javascript
if (patch.stats !== undefined) next.stats = { ...(next.stats || {}), ...patch.stats };
```

Добавить:
```javascript
if (patch.buffer_api_key !== undefined) next.buffer_api_key = patch.buffer_api_key || null;
if (patch.buffer_channel_id !== undefined) next.buffer_channel_id = String(patch.buffer_channel_id || '').trim() || null;
if (patch.publish_mode !== undefined) next.publish_mode = ['direct', 'buffer'].includes(patch.publish_mode) ? patch.publish_mode : 'direct';
```

---

## ФАЗА 4: Расширение POST /channels/pinterest в manage/routes.js

### Контекст

Маршрут `POST /channels/pinterest` находится в `manage/routes.js` (~строка 523).
Сейчас он принимает: `chat_id, app_id, app_secret, board_id, board_name, website_url, is_active, auto_publish`.

Нужно принять и передать в `setPinterestConfig` три новых поля:
`buffer_api_key`, `buffer_channel_id`, `publish_mode`.

### Что изменить

**Строка деструктуризации** (найти и расширить):
```javascript
const { chat_id: chatId, app_id, app_secret, board_id, board_name, website_url, is_active, auto_publish } = req.body;
```

Заменить на:
```javascript
const { chat_id: chatId, app_id, app_secret, board_id, board_name, website_url, is_active, auto_publish, buffer_api_key, buffer_channel_id, publish_mode } = req.body;
```

**После блока проверок `is_active` и `auto_publish`** добавить:
```javascript
if (buffer_api_key !== undefined) patch.buffer_api_key = buffer_api_key;
if (buffer_channel_id !== undefined) patch.buffer_channel_id = buffer_channel_id;
if (publish_mode !== undefined) patch.publish_mode = publish_mode;
```

---

## ФАЗА 5: Условная логика в publishPin()

### Контекст

Функция `publishPin(chatId, bot, jobId, correlationId)` в
`services/pinterestMvp.service.js` (строка ~411).

Нужно заменить блок публикации на условный `if/else`:
- Если `cfg.publish_mode === 'buffer'` — публиковать через Buffer API
- Иначе — использовать оригинальный код через Pinterest API v5

### Что добавить

1. Импорт `bufferService` в начало файла (после импорта `pinterestService`):
```javascript
const bufferService = require('./buffer.service');
```

2. В функции `publishPin()` найти блок публикации через Pinterest API
   (между "Копируем изображение" и "Запись в лог")
   и заменить на условный блок (см. планов файла).

### Основная логика

```javascript
let result;

if (cfg.publish_mode === 'buffer') {
  // Публикация через Buffer GraphQL API
  if (!cfg.buffer_api_key || !cfg.buffer_channel_id) {
    throw new Error('Buffer API key или channel_id не настроены');
  }
  const imageUrl = `${config.APP_URL}/api/files/public/${chatId}/pin_${jobId}.png`;
  const text = [job.pin_title, '', job.pin_description].filter(Boolean).join('\n');
  const bufferResult = await bufferService.createPost(cfg.buffer_api_key, cfg.buffer_channel_id, { text, imageUrl });
  result = { id: bufferResult.postId };
  console.log(`[PINTEREST-MVP] Published via Buffer, postId=${bufferResult.postId}`);
} else {
  // Публикация напрямую через Pinterest API v5 (оригинальный код)
  const session = await sessionService.getOrCreateSession(chatId);
  const tempPath = path.join(os.tmpdir(), `pin-publish-${chatId}-${jobId}.png`);
  await dockerService.copyFromContainer(session.containerId, job.image_path, tempPath);

  let imageBuffer = await fs.readFile(tempPath);
  await fs.unlink(tempPath).catch(() => {});

  // Водяной знак
  const logoPath = '/workspace/brand/logo.png';
  const logoLocalPath = path.join(os.tmpdir(), `pin-logo-${chatId}.png`);
  try {
    await dockerService.copyFromContainer(session.containerId, logoPath, logoLocalPath);
    imageBuffer = await imageService.overlayWatermark(imageBuffer, logoLocalPath);
    await fs.unlink(logoLocalPath).catch(() => {});
  } catch (e) {
    console.log(`[PINTEREST-MVP] Watermark skipped: ${e.message}`);
  }

  const accessToken = await pinterestService.getValidToken(chatId, cfg);
  const imageBase64 = imageBuffer.toString('base64');
  result = await pinterestService.createPin(accessToken, {
    boardId: job.board_id,
    title: job.pin_title,
    description: job.pin_description,
    link: job.link || undefined,
    mediaSource: {
      source_type: 'image_base64',
      content_type: 'image/png',
      data: imageBase64
    }
  });
}
```

---

## ФАЗА 6: Интеграционное тестирование

### Проверки

1. **Синтаксис всех файлов:**
   ```bash
   node --check /root/docker-claw/routes/files.routes.js
   node --check /root/docker-claw/services/buffer.service.js
   node --check /root/docker-claw/manage/store.js
   node --check /root/docker-claw/manage/routes.js
   node --check /root/docker-claw/services/pinterestMvp.service.js
   ```

2. **APP_URL в config.js** — убедиться что задан (требуется для построения публичных URL)

3. **node-fetch доступен** — проверить что `require('node-fetch')` работает

4. **Endpoint функционирует** (при наличии тестовых изображений):
   ```bash
   curl -I "https://clientzavod.ru/api/files/public/{chatId}/pin_{jobId}.png"
   ```

5. **API endpoint принимает новые поля:**
   ```bash
   curl -X POST https://clientzavod.ru/api/manage/channels/pinterest \
     -H "Content-Type: application/json" \
     -d '{
       "chat_id": "{chatId}",
       "publish_mode": "buffer",
       "buffer_api_key": "{API_KEY}",
       "buffer_channel_id": "{CHANNEL_ID}",
       "is_active": true
     }'
   ```

---

## Критические файлы для изменения

| Файл | Изменение |
|---|---|
| `routes/files.routes.js` | +35 строк: `GET /public/:chatId/:filename` |
| `services/buffer.service.js` | Новый файл: функция `createPost()` |
| `manage/store.js` | +3 строки в `setPinterestConfig` |
| `manage/routes.js` | +3 поля в destructuring + 3 строки в patch |
| `services/pinterestMvp.service.js` | Импорт bufferService + условный if/else в `publishPin()` |

### Остаются без изменений

- `services/pinterest.service.js` — прямой API остаётся как fallback
- Логика генерации, модерации, расписания
- Таблицы БД, фронтенд
- `routes/index.js` (файлы routes уже зарегистрированы)

---

## Справочная информация

### Buffer GraphQL API Документация
- https://developers.buffer.com/guides/getting-started.html
- Мутация: `createPost`
- Режим публикации: `shareNow` — публиковать немедленно
- Автоматическое расписание: `schedulingType: automatic`

### Образец для Instagram
- `/root/docker-claw/documents/INSTAGRAM_BUFFER_SETUP.md`
- Показывает как получить и использовать Buffer API ключ
- Показывает как получить Channel ID через GraphQL

### Обратная совместимость
- Существующие пользователи без `publish_mode` продолжают использовать прямой Pinterest API
- Можно переключаться между режимами через POST /api/manage/channels/pinterest
- Откат: установить `publish_mode: "direct"` (или не передавать поле вообще)
