# 📊 Шаблон Google Sheets для импорта тем и каналов

## 🎯 Назначение

Этот шаблон позволяет импортировать из Google Sheets:
1. **Темы** для публикаций (план контента)
2. **Каналы** для размещения (Telegram, VK, Instagram и т.д.)
3. **Настройки публикаций** для каждого канала

---

## 📋 Структура Google Sheets

Создайте Google Sheet с **тремя вкладками**:

### Вкладка 1: `Темы` (Topics)

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| **Тема** | **Фокусный ключ** | **Вторичные ключи** | **LSI-ключи** | **Статус** | **Кампания** | **Приоритет** |

#### Пример заполнения:

| Тема | Фокусный ключ | Вторичные ключи | LSI-ключи | Статус | Кампания | Приоритет |
|------|---------------|-----------------|-----------|--------|----------|-----------|
| Как выбрать таргетированную рекламу | таргетированная реклама | реклама ВКонтакте, реклама в Instagram | целевая аудитория, конверсия, бюджет | pending | Q1-2026 | 5 |
| 5 ошибок при запуске рекламы в Telegram Ads | Telegram Ads | реклама в Telegram, продвижение в Telegram | рекламный бюджет, ROI, ошибки | pending | Q1-2026 | 5 |
| Контент-план на месяц | контент-план | план публикаций, SMM планирование | регулярность публикаций, вовлечённость | pending | Q1-2026 | 3 |

---

### Вкладка 2: `Каналы` (Channels)

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| **Канал** | **Тип** | **ID канала** | **Имя** | **Токен** | **Активен** | **Автопубликация** | **Настройки** |

#### Пример заполнения:

| Канал | Тип | ID канала | Имя | Токен | Активен | Автопубликация | Настройки |
|-------|-----|-----------|-----|-------|---------|----------------|-----------|
| telegram | social | -1001142729178 | Клиент-завод | (токен бота) | TRUE | FALSE | {"disable_notification": false} |
| vk | social | 123456789 | Клиент-завод VK | (service token) | TRUE | FALSE | {"group_id": "123456789"} |
| instagram | social | client_zavod | @client_zavod | (access token) | TRUE | FALSE | {"is_business": true} |
| pinterest | social | 980870062533264681 | Клиент-завод Pinterest | (access token) | TRUE | FALSE | {"board_id": "980870062533264681", "board_name": "Клиент-завод"} |
| youtube | video | UCxxxxxxxx | ClientZavod | (OAuth token) | FALSE | FALSE | {"category": "Education"} |
| blog | blog | /blog | Корпоративный блог | (API key) | TRUE | TRUE | {"author_id": "1"} |

---

### Вкладка 3: `Публикации` (Publications) - ОПЦИОНАЛЬНО

Для детального планирования публикаций по каналам:

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| **Тема** | **Канал** | **Тип контента** | **Заголовок** | **Время публикации** | **Приоритет** | **Статус** | **Настройки** | **Кампания** |

#### Пример заполнения:

| Тема | Канал | Тип контента | Заголовок | Время публикации | Приоритет | Статус | Настройки | Кампания |
|------|-------|--------------|-----------|------------------|-----------|--------|-----------|----------|
| Как выбрать таргетированную рекламу | telegram | post | | 2026-03-24 09:00 | 5 | pending | {"chat_id": "-100..."} | Q1-2026 |
| Как выбрать таргетированную рекламу | vk | post | | 2026-03-24 10:00 | 5 | pending | {"group_id": "..."} | Q1-2026 |
| Как выбрать таргетированную рекламу | blog | article | Полный гайд по таргетированной рекламе | 2026-03-24 12:00 | 3 | pending | {"slug": "target-ads-guide"} | Q1-2026 |
| 5 ошибок Telegram Ads | telegram | post | | 2026-03-25 09:00 | 5 | pending | | Q1-2026 |

---

## 🔧 Импорт в систему

### Шаг 1: Получите Google Sheet ID

Из URL:
```
https://docs.google.com/spreadsheets/d/1ABC123xyz789/edit#gid=0
                                           ^^^^^^^^^^^^^^^^
                                           Это Sheet ID
```

### Шаг 2: Импорт тем

```bash
curl -X POST "https://clientzavod.ru/api/content/import-google-sheet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "chat_id": "128247430",
    "sheet_url": "https://docs.google.com/spreadsheets/d/1ABC123xyz789",
    "gid": "0",
    "mode": "topics"
  }'
```

### Шаг 3: Импорт каналов

```bash
curl -X POST "https://clientzavod.ru/api/content/import-channels" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "chat_id": "128247430",
    "sheet_url": "https://docs.google.com/spreadsheets/d/1ABC123xyz789",
    "gid": "1001"
  }'
```

### Шаг 4: Импорт публикаций

```bash
curl -X POST "https://clientzavod.ru/api/content/import-publications" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "chat_id": "128247430",
    "sheet_url": "https://docs.google.com/spreadsheets/d/1ABC123xyz789",
    "gid": "1002"
  }'
```

---

## 📄 CSV-шаблоны для скачивания

### Шаблон тем (Topics)

```csv
Тема,Фокусный ключ,Вторичные ключи,LSI-ключи,Статус,Кампания,Приоритет
Как выбрать таргетированную рекламу,таргетированная реклама,"реклама ВКонтакте, реклама в Instagram","целевая аудитория, конверсия",pending,Q1-2026,5
5 ошибок при запуске рекламы в Telegram Ads,Telegram Ads,"реклама в Telegram, продвижение в Telegram","рекламный бюджет, ROI",pending,Q1-2026,5
```

### Шаблон каналов (Channels)

```csv
Канал,Тип,ID канала,Имя,Токен,Активен,Автопубликация,Настройки
telegram,social,-1001142729178,Клиент-завод,,TRUE,FALSE,"{""disable_notification"": false}"
vk,social,123456789,Клиент-завод VK,,TRUE,FALSE,"{""group_id"": ""123456789""}"
blog,blog,/blog,Корпоративный блог,,TRUE,TRUE,"{""author_id"": ""1""}"
```

### Шаблон публикаций (Publications)

```csv
Тема,Канал,Тип контента,Заголовок,Время публикации,Приоритет,Статус,Настройки,Кампания
Как выбрать таргетированную рекламу,telegram,post,,2026-03-24 09:00,5,pending,,Q1-2026
Как выбрать таргетированную рекламу,vk,post,,2026-03-24 10:00,5,pending,,Q1-2026
```

---

## 🎯 Словари значений

### Типы каналов (channel)

| Значение | Описание | Пример ID |
|----------|----------|----------|
| `telegram` | Telegram канал/чат | `-1001142729178` |
| `vk` | ВКонтакте | `123456789` (группа) |
| `facebook` | Facebook | `123456789012345` (Page ID) |
| `instagram` | Instagram | `username` |
| `ok` | Одноклассники | `12345678901234` (Group ID) |
| `pinterest` | Pinterest | `980870062533264681` (Board ID) |
| `tiktok` | TikTok | `@username` |
| `youtube` | YouTube | `UCxxxxxxxxxxxxx` |
| `zen` | Яндекс.Дзен | `channel_id` |
| `blog` | Корпоративный блог | `/blog` |
| `email` | Email рассылка | `newsletter` |

### Типы контента (content_type)

| Значение | Описание | Для каких каналов |
|----------|----------|-------------------|
| `post` | Обычный пост | Telegram, VK, Instagram, Facebook, OK |
| `article` | Статья | Blog, Zen, VK Articles |
| `video` | Видео | YouTube, TikTok, VK Video |
| `reel` | Reels/Shorts | Instagram Reels, YouTube Shorts |
| `story` | Stories | Instagram, VK Stories |
| `pin` | Pinterest Pin | Pinterest |
| `newsletter` | Email рассылка | Email |

### Статусы (status)

| Значение | Описание |
|----------|----------|
| `pending` | Ожидает обработки |
| `used` | Тема используется |
| `completed` | Публикация завершена |
| `draft` | Черновик |
| `approved` | Одобрено |
| `scheduled` | Запланировано |
| `published` | Опубликовано |
| `failed` | Ошибка |

### Приоритеты (priority)

| Значение | Описание |
|----------|----------|
| `0` | По расписанию |
| `1-3` | Низкий |
| `4-6` | Средний |
| `7-9` | Высокий |
| `10` | Критичный |

---

## 📌 Pinterest: Детальная настройка

### Структура Pinterest канала

**Вкладка "Каналы":**
```csv
Канал,Тип,ID канала,Имя,Токен,Активен,Автопубликация,Настройки
pinterest,social,980870062533264681,Клиент-завод Pinterest,,TRUE,FALSE,"{""board_id"": ""980870062533264681"", ""board_name"": ""Клиент-завод"", ""link"": ""https://clientzavod.ru""}"
```

### Настройки Pinterest

| Параметр | Описание | Пример |
|----------|----------|--------|
| `board_id` | ID доски для публикаций | `980870062533264681` |
| `board_name` | Название доски (для удобства) | `Клиент-завод` |
| `link` | Ссылка на сайт | `https://clientzavod.ru` |
| `access_token` | Pinterest API токен | (получить в Pinterest Developer Portal) |

### Как получить Pinterest Board ID:

1. Откройте доску в Pinterest
2. URL будет вида: `https://pinterest.com/username/980870062533264681/`
3. Число в конце — это Board ID

### Пример публикации в Pinterest

**Вкладка "Публикации":**
```csv
Тема,Канал,Тип контента,Заголовок,Время публикации,Приоритет,Статус,Настройки,Кампания
Как выбрать таргетированную рекламу,pinterest,pin,,2026-03-24 11:00,4,pending,"{""board_id"": ""980870062533264681"", ""board_name"": ""Клиент-завод"", ""link"": ""https://clientzavod.ru/target-ads""}",Q1-2026
```

### Лучшие практики для Pinterest

1. **Изображения**: Вертикальные (2:3 или 1000x1500px)
2. **Описание**: 2-3 предложения с ключевыми словами
3. **Link**: Всегда указывайте ссылку на сайт
4. **Board**: Группируйте пины по тематическим доскам
5. **Rich Pins**: Включите для отображения доп. информации

---

## 💡 Лучшие практики

### 1. **Название вкладок**

Используйте русские названия для удобства:
- `Темы` (вместо Topics)
- `Каналы` (вместо Channels)
- `Публикации` (вместо Publications)

### 2. **Форматирование**

- **Первая строка** — всегда заголовки
- **Даты** — формат `YYYY-MM-DD HH:MM`
- **JSON** — экранируйте кавычки: `{""key"": ""value""}`
- **Списки** — через запятую: `ключ1, ключ2, ключ3`

### 3. **Валидация данных**

Настройте в Google Sheets **Data Validation**:

**Для статуса:**
```
Data → Data validation → List of items:
pending, used, completed, draft, approved, scheduled, published, failed
```

**Для приоритета:**
```
Data → Data validation → Number between 0 and 10
```

**Для канала:**
```
Data → Data validation → List of items:
telegram, vk, instagram, facebook, ok, zen, tiktok, youtube, pinterest, blog, email
```

### 4. **Условное форматирование**

Настройте цвета для статусов:
- `pending` — 🟡 Жёлтый
- `completed` — 🟢 Зелёный
- `failed` — 🔴 Красный
- `published` — 🔵 Синий

---

## 🔗 Пример Google Sheet

Создайте по шаблону:
https://docs.google.com/spreadsheets/d/ВАШ_ID

**Структура:**
- Вкладка 1 (gid=0): `Темы` — список тем для контента
- Вкладка 2 (gid=1001): `Каналы` — настройки каналов
- Вкладка 3 (gid=1002): `Публикации` — план публикаций

---

## 📁 Файлы проекта

- `GOOGLE_SHEET_TEMPLATE.md` — эта документация
- `content_schema.sql` — схема БД
- `services/contentMvp.service.js` — логика импорта
- `content_queue_import_template.csv` — CSV шаблон для очереди

---

## ⚠️ Важные заметки

1. **Sheet ID** — извлекается из URL между `/d/` и `/edit`
2. **GID вкладки** — параметр `gid=` в URL (0 для первой вкладки)
3. **Кодировка** — Google Sheets автоматически использует UTF-8
4. **Лимиты** — до 5 млн ячеек в одной таблице
5. **Доступ** — убедитесь, что Sheet доступен по ссылке или предоставлен доступ сервисному аккаунту
