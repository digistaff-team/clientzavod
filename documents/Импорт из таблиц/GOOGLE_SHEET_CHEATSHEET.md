# 📊 Google Sheets: Краткая шпаргалка

## 🎯 Структура таблицы

Создайте Google Sheet с **3 вкладками**:

```
📋 Google Sheet: Контент-план
├── Вкладка 1: Темы (gid=0)
├── Вкладка 2: Каналы (gid=1001)
└── Вкладка 3: Публикации (gid=1002)
```

---

## 📄 Вкладка 1: ТЕМЫ

**Назначение:** Список тем для контента

| Колонка | Пример | Обяз. |
|---------|--------|-------|
| Тема | Как выбрать таргетированную рекламу | ✅ |
| Фокусный ключ | таргетированная реклама | ❌ |
| Вторичные ключи | реклама ВКонтакте, реклама в Instagram | ❌ |
| LSI-ключи | целевая аудитория, конверсия | ❌ |
| Статус | pending | ❌ |
| Кампания | Q1-2026 | ❌ |
| Приоритет | 5 | ❌ |

**Шаблон:** `google_sheet_topics_template.csv`

---

## 📄 Вкладка 2: КАНАЛЫ

**Назначение:** Настройки каналов для публикаций

| Колонка | Пример | Обяз. |
|---------|--------|-------|
| Канал | telegram | ✅ |
| Тип | social | ✅ |
| ID канала | -1001142729178 | ✅ |
| Имя | Клиент-завод | ❌ |
| Токен | (токен бота) | ❌ |
| Активен | TRUE | ❌ |
| Автопубликация | FALSE | ❌ |
| Настройки | `{"disable_notification": false}` | ❌ |

**Шаблон:** `google_sheet_channels_template.csv`

---

## 📄 Вкладка 3: ПУБЛИКАЦИИ

**Назначение:** Детальный план публикаций

| Колонка | Пример | Обяз. |
|---------|--------|-------|
| Тема | Как выбрать таргетированную рекламу | ✅ |
| Канал | telegram | ✅ |
| Тип контента | post | ❌ |
| Заголовок | Полный гайд по таргетированной рекламе | ❌ |
| Время публикации | 2026-03-24 09:00 | ❌ |
| Приоритет | 5 | ❌ |
| Статус | pending | ❌ |
| Настройки | `{"chat_id": "-100..."}` | ❌ |
| Кампания | Q1-2026 | ❌ |

**Шаблон:** `google_sheet_publications_template.csv`

---

## 🚀 Импорт

### 1. Получите Sheet ID

Из URL:
```
https://docs.google.com/spreadsheets/d/1ABC123xyz789/edit
                                    ^^^^^^^^^^^^^^^^
                                    Sheet ID
```

### 2. Импорт тем

```bash
curl -X POST "https://clientzavod.ru/api/content/import-google-sheet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{
    "chat_id": "128247430",
    "sheet_url": "https://docs.google.com/spreadsheets/d/SHEET_ID",
    "mode": "topics"
  }'
```

### 3. Импорт каналов

```bash
curl -X POST "https://clientzavod.ru/api/content/import-channels" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{
    "chat_id": "128247430",
    "sheet_url": "https://docs.google.com/spreadsheets/d/SHEET_ID",
    "gid": "1001"
  }'
```

---

## 🎯 Словари

### Каналы
- `telegram` — Telegram
- `vk` — ВКонтакте
- `facebook` — Facebook
- `instagram` — Instagram
- `ok` — Одноклассники
- `pinterest` — Pinterest
- `tiktok` — TikTok
- `youtube` — YouTube
- `zen` — Яндекс.Дзен
- `blog` — Блог
- `email` — Email

### Типы контента
- `post` — Пост
- `article` — Статья
- `video` — Видео
- `reel` — Reels/Shorts
- `story` — Stories
- `pin` — Pinterest Pin
- `newsletter` — Email

### Статусы
- `pending` — Ожидает
- `used` — Используется
- `completed` — Готово
- `published` — Опубликовано
- `failed` — Ошибка

---

## 💡 Советы

1. **Первая строка** — всегда заголовки
2. **Даты** — `YYYY-MM-DD HH:MM`
3. **JSON** — `{""key"": ""value""}` (двойные кавычки)
4. **Списки** — `ключ1, ключ2, ключ3`
5. **GID вкладки** — параметр в URL: `gid=1001`

---

## 📁 Файлы

- `google_sheet_topics_template.csv` — шаблон тем
- `google_sheet_channels_template.csv` — шаблон каналов
- `google_sheet_publications_template.csv` — шаблон публикаций
- `GOOGLE_SHEET_TEMPLATE.md` — полная документация
