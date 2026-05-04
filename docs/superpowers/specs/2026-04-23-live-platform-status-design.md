# Живой статус платформы в контексте AI-агента

**Дата:** 2026-04-23  
**Статус:** Утверждён

## Проблема

AI-агент знает, что каналы настроены, но не видит живого состояния платформы: сколько постов в очереди, когда последняя публикация, закончатся ли темы завтра. Пользователь вынужден объяснять ситуацию вручную.

## Решение

Добавить блок `=== ЖИВОЙ СТАТУС ПЛАТФОРМЫ ===` в системный промпт AI-агента. Данные собираются с TTL-кэшем 60 секунд из per-user PostgreSQL и `manageStore`.

## Архитектура

### Поток данных

```
buildFullContextStructured(chatId)
    → liveStatusService.getLiveStatus(chatId)
        → TTL-кэш Map (60 сек)
            → getPool(chatId) + 2 SQL-запроса  [при промахе кэша]
    → return { ...existing, liveStatus }

getSystemInstruction(mode, structuredContext)
    → if structuredContext.liveStatus
        → форматирует блок "ЖИВОЙ СТАТУС ПЛАТФОРМЫ"
```

### Источники данных

| Данные | Источник | Стоимость |
|--------|----------|-----------|
| Активность канала (is_active) | `manageStore` | бесплатно (in-memory) |
| Очередь, публикации сегодня, последняя дата | per-channel jobs tables (UNION) | 1 SQL-запрос |
| Доступные темы | `content_topics` | 1 SQL-запрос |
| Лимиты каналов | `services/content/limits.js` | бесплатно (константы) |

### Схема таблиц

У каждого канала своя jobs-таблица в per-user DB. Общая структура одинакова:

| Канал | Таблица джобов |
|-------|---------------|
| Telegram | `content_jobs` |
| VK | `vk_jobs` |
| OK | `ok_jobs` |
| Pinterest | `pinterest_jobs` |
| Instagram | `instagram_jobs` |
| YouTube | `youtube_jobs` |
| Facebook | `facebook_jobs` |

Все таблицы имеют колонки `status TEXT`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`. При публикации `status` меняется на `'published'` и `updated_at` обновляется.

### SQL-запросы

Доступ через `repository.withClient(chatId, fn)` из `services/content/repository.js`.

```sql
-- Запрос 1: очередь и публикации по всем каналам (UNION)
SELECT 'telegram' AS channel,
       COUNT(*) FILTER (WHERE status IN ('draft','ready','approved')) AS queued,
       COUNT(*) FILTER (WHERE status = 'published' AND updated_at >= CURRENT_DATE) AS published_today,
       MAX(updated_at) FILTER (WHERE status = 'published') AS last_published_at
FROM content_jobs
UNION ALL
SELECT 'vk', ... FROM vk_jobs
UNION ALL
SELECT 'ok', ... FROM ok_jobs
UNION ALL
SELECT 'pinterest', ... FROM pinterest_jobs
UNION ALL
SELECT 'instagram', ... FROM instagram_jobs
UNION ALL
SELECT 'youtube', ... FROM youtube_jobs
UNION ALL
SELECT 'facebook', ... FROM facebook_jobs;

-- Запрос 2: доступные темы
SELECT COUNT(*) AS cnt FROM content_topics WHERE status = 'pending';
```

Оба запроса выполняются как единый `withClient` вызов — одно соединение к БД.

## Формат блока в промпте

```
=== ЖИВОЙ СТАТУС ПЛАТФОРМЫ ===
(данные актуальны, обновлено 12 сек назад)

Telegram   — 3 в очереди  | сегодня опубликовано: 2     | последний: 45 мин назад
VK         — 1 в очереди  | сегодня опубликовано: 3/5   | последний: 2 ч назад
Instagram  — очередь пуста| сегодня опубликовано: 0     | последний: вчера
Pinterest  — не подключён
YouTube    — не настроен

Доступных тем для генерации: 12
```

Легенда:
- **«не подключён»** — канал в стейте, но `is_active = false`
- **«не настроен»** — канала нет в стейте
- **«3/5»** — из лимитов `limits.js` (только для каналов с жёстким лимитом: VK, OK, Instagram)
- Время форматируется как relative («45 мин назад», «вчера»)

## Файлы и изменения

| Файл | Действие | Описание |
|------|----------|----------|
| `services/content/liveStatus.service.js` | создать | TTL-кэш + SQL-запросы + форматирование времени |
| `manage/context.js` | обновить | добавить `liveStatus: await getLiveStatus(chatId)` в `buildFullContextStructured()` |
| `manage/prompts.js` | обновить | новый блок `=== ЖИВОЙ СТАТУС ПЛАТФОРМЫ ===` после блока инфраструктуры |
| `manage/routes.js` | обновить | `liveStatusService.invalidate(chatId)` при сохранении настроек канала |

## Обработка ошибок

- Если per-user DB недоступна: `getLiveStatus()` возвращает `null`, блок не добавляется в промпт, AI работает как раньше.
- Если сессия не найдена: `buildFullContextStructured()` возвращает заглушку раньше, `getLiveStatus` не вызывается.
- Инвалидация кэша: при сохранении настроек канала (`POST /api/manage/channels/:name`) вызывается `liveStatusService.invalidate(chatId)`.

## Ограничения

- Данные могут быть устаревшими до 60 сек — приемлемо для AI-ассистента.
- Статистика ошибок публикации не включена (нет таблицы с логом ошибок по каналам).
- Расписание следующей публикации не включено — `scheduled_at` не всегда заполнен.
