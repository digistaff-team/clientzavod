# Image-to-Image: логика генерации изображений для публикаций

## Суть

Если пользователь положил изображение в папку `/workspace/input` своего контейнера, оно используется как визуальный референс при генерации картинок для постов во всех каналах. Без файла в `input/` поведение прежнее — чистая генерация по текстовому промпту.

---

## Каналы, которые используют эту логику

- Telegram
- VK
- Одноклассники
- Instagram
- Pinterest (вертикальный формат 2:3, остальные 1:1)
- Facebook

YouTube, TikTok, VK Video используют отдельный видео-пайплайн и этой логики не касаются.

---

## Файлы в `/workspace/input`

Поддерживаются два типа файлов — они могут лежать одновременно:

| Тип | Расширения | Что делает |
|-----|-----------|------------|
| Изображение | `.png` `.jpg` `.jpeg` `.webp` `.gif` | Передаётся в Kie.ai как референс (image-to-image) |
| Текстовое описание | `.txt` `.md` | Содержимое становится промптом вместо автоматического |

Остальные файлы (PDF, XLSX и т.д.) игнорируются.

---

## Приоритеты и комбинации

```
Только текстовый файл   → text-to-image, промпт из файла
Только изображение      → image-to-image, промпт из topic
Текст + изображение     → image-to-image, промпт из текстового файла
Ничего                  → text-to-image, промпт из topic (поведение как раньше)
```

Если несколько изображений — выбирается случайное при каждой генерации.  
Если несколько текстовых файлов — берётся первый непустой. Текст обрезается до 500 символов.

---

## Технический процесс

### Шаг 1: Чтение `input/`

Модуль `services/inputImageContext.service.js`, функция `getInputContext(chatId)`:

1. Выполняет `find /workspace/input -maxdepth 1 -type f` внутри Docker-контейнера пользователя
2. Разделяет файлы на текстовые и изображения
3. Читает содержимое текстовых файлов через `cat`
4. Возвращает `{ textPrompt, imageFile }` — оба поля могут быть `null`

### Шаг 2: Выбор режима

Функция `generateImage(chatId, basePrompt, aspectRatio, t2iModel)`:

```
imageFile найден → image-to-image (i2i)
imageFile не найден → text-to-image (t2i)
```

Итоговый промпт:
```
textPrompt есть → использовать textPrompt
textPrompt нет  → использовать basePrompt (формируется каналом из topic)
```

### Шаг 3a: Image-to-image

- Endpoint: `POST https://api.kie.ai/api/v1/image/generate`
- Модель: `kie-image-v1` (или `KIE_IMAGE_MODEL` из env)
- Параметры: `prompt`, `aspect_ratio`, `imageUrls: [публичный URL картинки]`
- Публичный URL картинки: `/api/video/input/:chatId/:filename` — этот endpoint уже существует и отдаёт файлы из `input/`
- Polling: `GET /api/v1/image/tasks/:taskId` — каждые 3 сек, максимум 30 попыток (90 сек)
- При сбое → автоматический fallback на text-to-image

### Шаг 3b: Text-to-image (без изменений)

- Endpoint: `POST https://api.kie.ai/api/v1/jobs/createTask`
- Telegram: модель `nano-banana-2`
- Остальные каналы: модель `grok-imagine/text-to-image`
- Polling: `GET /api/v1/jobs/recordInfo?taskId=` — каждые 5 сек, максимум 18 попыток (90 сек)

---

## Схема

```
/workspace/input/
  ├── photo.jpg        ← изображение-референс
  └── description.txt  ← текст промпта

        ↓ getInputContext(chatId)
        
{ textPrompt: "...", imageFile: "photo.jpg" }

        ↓ generateImage(chatId, basePrompt, '1:1', model)

Оба есть → i2i: POST /api/v1/image/generate
             imageUrls: [APP_URL/api/video/input/chatId/photo.jpg]
             prompt: "..." (из description.txt)
             
             polling /api/v1/image/tasks/:taskId
             ↓ сбой? → fallback
             
Нет картинки → t2i: POST /api/v1/jobs/createTask
               prompt: basePrompt (из topic)
               
               polling /api/v1/jobs/recordInfo
               
        ↓ Buffer (PNG)
        
Канал сохраняет в контейнер → публикует
```

---

## Env-переменные

| Переменная | Назначение | Дефолт |
|-----------|-----------|--------|
| `KIE_API_KEY` | Ключ Kie.ai API | обязательная |
| `KIE_IMAGE_MODEL` | Модель для i2i | `kie-image-v1` |
| `APP_URL` | Базовый URL для публичных ссылок на файлы | из config |

---

## Ключевые файлы

| Файл | Роль |
|------|------|
| `services/inputImageContext.service.js` | Весь общий код: чтение input, i2i, t2i, ветвление |
| `tests/inputImageContext.test.js` | Unit-тесты логики разбора файлов |
| `routes/video.routes.js` | Endpoint `/api/video/input/:chatId/:filename` для публичного доступа к input-файлам |
| `services/telegramMvp.service.js` | `generateImage(chatId, topic, text)` — делегирует в inputImageContext |
| `services/vkMvp.service.js` | `generateVkImage(chatId, topic, imagePrompt)` — делегирует |
| `services/okMvp.service.js` | `generateOkImage(chatId, topic, imagePrompt)` — делегирует |
| `services/instagramMvp.service.js` | `generateIgImage(chatId, topic, imagePrompt)` — делегирует |
| `services/pinterestMvp.service.js` | `generatePinImage(chatId, topic, pinTitle)` — делегирует, aspect ratio 2:3 |
| `services/facebookMvp.service.js` | `generateFbImage(chatId, topic, imagePrompt, jobId)` — делегирует |
