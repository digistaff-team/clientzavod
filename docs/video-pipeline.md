# Видео-пайплайн (KIE.ai)

## Процесс

Случайное фото товара из `/workspace/input` + случайный интерьер из БД → KIE.ai image-to-image (сцена) → KIE.ai image-to-video → временная папка → каналы забирают по расписанию → все 4 канала использовали → таймер 60 мин → удаление.

## Адаптеры `generateVideoFromScene`

- **Veo 3.1** (`veo3.1`) — `POST /api/v1/veo/generate` + polling `GET /api/v1/veo/get-1080p-video`
- **Seedance 2.0** (`seedance-2`) — `POST /api/v1/jobs/createTask` с `callBackUrl`, webhook-резолюция через `pendingCallbacks` Map
- **Grok Imagine** (`grok-imagine`) — аналогично Seedance, `duration` строкой `'8'`

Webhook: `POST /api/video/callback/:chatId/:videoId` → `videoPipeline.resolveVideoCallback(videoId, body)`.

Модель видео: `manageStore.getVideoPipelineSettings(chatId).model` (дефолт `'veo3.1'`), API: `GET/POST /api/video/settings`.

## Модели изображений

`ALLOWED_IMAGE_MODELS` в `manage/store.js`:
- `grok-imagine/text-to-image` — t2i-only
- `nano-banana-2` — i2i+t2i
- `seedream/4.5-edit` — i2i+t2i
- `flux-2/pro-image-to-image` — i2i-only (fallback на `grok-imagine` если нет файла)

KIE.ai использует разные поля для референса — схемы в `I2I_SCHEMAS` (`inputImageContext.service.js`). При добавлении новой i2i-модели добавить схему туда же.

Модель изображений: `manageStore.getImageGenSettings(chatId).model`, API: `GET/POST /api/video/image-settings`.

## Файлы

- Временные: `VIDEO_TEMP_ROOT` = `{DATA_ROOT}/.video-temp/{chatId}/`
- Публичные URL для KIE.ai: `/api/video/temp/:chatId/:filename` (сцены), `/api/video/input/:chatId/:filename` (input/)
