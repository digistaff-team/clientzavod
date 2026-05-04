# Default Moderator: Owner as Default + Remove Global Env Override

**Date:** 2026-04-27  
**Status:** Approved

## Problem

Сейчас поля «Модератор» во всех каналах используют глобальную переменную окружения `CONTENT_MVP_MODERATOR_USER_ID` как запасной вариант, если пользователь не настроил модератора. Это приводит к тому, что черновики всех пользователей по умолчанию летят одному глобальному ID вместо самого владельца контейнера.

## Goal

- Черновик по умолчанию отправляется **владельцу контейнера** (его `verifiedTelegramId`).
- Владелец может указать другой `chat_id` в поле «Модератор» конкретного канала — тогда черновики этого канала пойдут указанному модератору.
- Все сообщения отправляются через **@czcw_bot** (`CW_BOT_TOKEN`) независимо от получателя.
- `CONTENT_MVP_MODERATOR_USER_ID` полностью удаляется из кодовой базы и `.env`.

## Non-Goals

- Изменение логики выбора бота для отправки (CW bot используется везде — менять не нужно).
- Изменения фронтенда — поля уже заполняются через `s.moderatorUserId || chatId`, что корректно.

## Design

### Хелпер `getEffectiveModerator(chatId, channelConfig)`

Добавить в `manage/store.js` и экспортировать:

```js
function getEffectiveModerator(chatId, channelConfig) {
    const state = getState(chatId);
    return String(
        channelConfig?.moderatorUserId ||
        channelConfig?.moderator_user_id ||
        state?.verifiedTelegramId ||
        chatId
    );
}
```

Принимает `chatId` контейнера и опциональный объект конфига канала. Возвращает строку — итоговый Telegram ID получателя.

### Сервисы отправки (10 мест в 9 файлах)

Заменить inline-цепочки с `CONTENT_MVP_MODERATOR_USER_ID` на вызов хелпера:

| Файл | Функция |
|------|---------|
| `services/telegramMvp.service.js` | `sendDraftToModerator`, `sendVideoDraftToModerator` |
| `services/vkMvp.service.js` | `sendVkDraftToModerator` |
| `services/okMvp.service.js` | `sendOkDraftToModerator` |
| `services/instagramMvp.service.js` | `sendIgDraftToModerator` × 2 (фото + reels) |
| `services/youtubeMvp.service.js` | `sendYtDraftToModerator` |
| `services/pinterestMvp.service.js` | `sendPinDraftToModerator` |
| `services/facebookMvp.service.js` | `sendFbToModerator` |
| `services/tiktokMvp.service.js` | `sendTiktokToModerator` |
| `services/vkVideoMvp.service.js` | `sendVkVideoToModerator` |
| `services/content/worker.js` | `sendBlogModerationRequest` (WP, × 2) |

В `telegramMvp.service.js` также удалить константу `MODERATOR_USER_ID` (строка 48), которая теперь не нужна.

### Access-check блоки (14 мест)

В этих блоках `ownerTgId` уже всегда присутствует в `allowedIds`, поэтому `CONTENT_MVP_MODERATOR_USER_ID` был лишним. Достаточно убрать `|| process.env.CONTENT_MVP_MODERATOR_USER_ID` из цепочки `channelModeratorId`:

- `server.js` — 9 мест (TG, VK, OK, IG, YT, PIN, TT, FB, VK Video)
- `manage/telegram/runner.js` — 4 места (PIN, VK, OK, IG access checks)
- `manage/telegram/runner.js:1234` — WP access check (уже исправлен ранее, использует `wpConfig?.moderatorUserId`)

### `.env`

Удалить строку:
```
CONTENT_MVP_MODERATOR_USER_ID=8092697980
```

## Файлы затронутые изменениями

- `manage/store.js` — добавить `getEffectiveModerator`, экспортировать
- `services/telegramMvp.service.js`
- `services/vkMvp.service.js`
- `services/okMvp.service.js`
- `services/instagramMvp.service.js`
- `services/youtubeMvp.service.js`
- `services/pinterestMvp.service.js`
- `services/facebookMvp.service.js`
- `services/tiktokMvp.service.js`
- `services/vkVideoMvp.service.js`
- `services/content/worker.js`
- `server.js`
- `manage/telegram/runner.js`
- `.env`

## Error Handling

Если `verifiedTelegramId` не задан (пользователь не прошёл онбординг) и `channelConfig.moderatorUserId` пуст — хелпер возвращает `chatId`. Сервисы, которые проверяют `if (!moderatorId)` перед отправкой, продолжат работать корректно.

## Testing

- Убедиться, что у пользователя без настроенного `moderatorUserId` черновики уходят на `verifiedTelegramId`.
- Убедиться, что у пользователя с настроенным `moderatorUserId` черновики уходят на указанный ID.
- Убедиться, что кнопки модерации нажимаются обоими: владельцем и назначенным модератором.
