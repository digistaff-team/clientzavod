# Упрощение настройки премодерации: дефолтный модератор = chatId

**Дата:** 2026-04-21

## Цель

Убрать лишнее поле "глобальный модератор" из integrationSettings и сделать так, чтобы дефолтным модератором для каждого канала автоматически становился сам пользователь (его chatId). Поле ID модератора на странице каналов отображается только при включённой премодерации и заполняется автоматически.

## Затронутые файлы

- `public/channels.html` — удалить `input#globalModeratorUserId`
- `public/js/channels.js` — логика показа/скрытия и авто-заполнения поля модератора (9 каналов)
- `manage/store.js` — игнорировать `moderator_user_id` в `setIntegrationSettings`

## Дизайн

### Фронтенд: поведение поля модератора

**Каналы:** Telegram (contentSettings), VK, OK, Pinterest, Instagram, Instagram Reels, YouTube, TikTok, VK Video.

**При загрузке страницы:**
- Если `premoderationEnabled = true` и `moderatorUserId` непустой → показать блок, заполнить сохранённым значением.
- Если `premoderationEnabled = true` и `moderatorUserId` пустой → показать блок, заполнить `getChatId()`.
- Если `premoderationEnabled = false` → блок скрыт.

**При переключении чекбокса:**
- Включается → показать блок; если поле пустое — заполнить `getChatId()`.
- Выключается → скрыть блок (значение сохраняется в DOM, не отправляется).

**Реализация:** поле и его лейбл оборачиваются в `div.moderator-field-row` со стилем `display:none` по умолчанию. Управление через JS на событии `change` чекбокса.

### Фронтенд: удаление глобального поля

- Удалить `input#globalModeratorUserId` из `channels.html`.
- Удалить все строки в `channels.js`, которые читают/записывают это поле.
- Убрать `moderator_user_id` из тела запроса к `POST /api/manage/integrations`.

### Бэкенд: игнорирование глобального поля

В `manage/store.js`, функция `setIntegrationSettings`:

```js
// Удалить эти строки:
if (patch.moderator_user_id !== undefined)
    next.moderator_user_id = String(patch.moderator_user_id || '').trim() || null;
```

Существующие значения `moderator_user_id` в JSON-файлах пользователей перестают применяться — все сервисы уже читают только канальный `cfg.moderator_user_id` (исправлено 2026-04-21).

### Иерархия модератора после изменений

```
канальный cfg.moderator_user_id (если задан вручную)
  → chatId владельца (дефолт)
```

## Что не меняется

- Структура канальных конфигов (поле `moderator_user_id` остаётся в каждом канале).
- Бэкенд-логика сервисов — иерархия уже исправлена.
- Поведение при сохранении формы — отправляется то, что в поле.
