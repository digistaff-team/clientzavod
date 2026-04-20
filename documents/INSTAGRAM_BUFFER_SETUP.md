# Настройка Instagram через Buffer API

## Преимущества Buffer перед прямым Instagram Graph API

| Критерий | Instagram Graph API | Buffer.com |
|----------|---------------------|------------|
| **Авторизация** | OAuth 2.0 через Facebook, нужно App Review | OAuth 2.0 через Buffer, нет App Review |
| **Токены** | Facebook Page Access Token (60 дней) | Buffer Access Token (бессрочный) |
| **Требования** | Instagram Business Account, Facebook Page | Instagram Business/Creator Account |
| **Сложность** | Высокая (2 шага: container → publish) | Низкая (1 вызов API) |
| **Rate limits** | 200 запросов/час на пользователя | 60 запросов/мин на пользователя |

---

## Инструкция по подключению

### Шаг 1: Регистрация в Buffer

1. Перейдите на [https://buffer.com](https://buffer.com)
2. Зарегистрируйтесь (есть бесплатный тариф с ограничением на 3 канала)
3. Подтвердите email

### Шаг 2: Подключение Instagram аккаунта

1. В личном кабинете нажмите **Add Channel** → **Instagram**
2. Выберите тип аккаунта: **Business** или **Creator**
3. Войдите через Facebook и разрешите доступ к Instagram
4. Выберите Instagram аккаунт из списка
5. Готово — канал появится в списке

### Шаг 3: Получение API токена

#### Вариант А: Через Buffer Developer Portal (рекомендуется)

1. Перейдите на [https://buffer.com/developers](https://buffer.com/developers)
2. Нажмите **Create New App**
3. Заполните:
   - **App Name**: `docker-claw` (или любое название)
   - **Description**: `Instagram publishing for Docker-Claw`
   - **Redirect URI**: `https://localhost:3015` (или ваш домен)
4. После создания скопируйте:
   - **Client ID**
   - **Client Secret**

5. Для получения токена выполните OAuth flow:

```bash
# Откройте в браузере (замените YOUR_CLIENT_ID и YOUR_REDIRECT_URI):
https://buffer.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&response_type=code

# После авторизации вы будете перенаправлены на:
# YOUR_REDIRECT_URI?code=AUTH_CODE

# Обменяйте код на токен:
curl -X POST https://api.bufferapp.com/oauth2/token.json \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=YOUR_REDIRECT_URI" \
  -d "code=AUTH_CODE"

# Ответ:
# {
#   "access_token": "YOUR_BUFFER_ACCESS_TOKEN",
#   "expires_in": 7776000
# }
```

#### Вариант Б: Через существующий токен (если есть)

Если у вас уже есть интеграция с Buffer, используйте существующий токен.

### Шаг 4: Получение Instagram Profile ID (Channel ID)

Buffer использует GraphQL API для получения информации о каналах.

#### Способ 1: Через REST API (простой)

```bash
curl -H "Authorization: Bearer YOUR_BUFFER_API_KEY" \
  https://api.bufferapp.com/1/profiles.json
```

В ответе найдите Instagram профиль:

```json
[
  {
    "id": "5f7a8b9c0d1e2f3g4h5i6j7k",  ← ЭТО Channel ID (Profile ID)
    "network": "instagram",
    "username": "your_instagram",
    "formatted_username": "@your_instagram",
    ...
  }
]
```

#### Способ 2: Через GraphQL API (продвинутый)

Если REST API не возвращает каналы, используйте GraphQL:

**1. Получите Organization ID:**

```bash
curl -X POST https://api.buffer.com/graphql \
  -H "Authorization: Bearer YOUR_BUFFER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query GetOrganizations { account { organizations { id name } } }"
  }'
```

Ответ:
```json
{
  "data": {
    "account": {
      "organizations": [
        {
          "id": "org_abc123",  ← Organization ID
          "name": "My Organization"
        }
      ]
    }
  }
}
```

**2. Получите список каналов:**

```bash
curl -X POST https://api.buffer.com/graphql \
  -H "Authorization: Bearer YOUR_BUFFER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query GetChannels { channels(input: { organizationId: \"org_abc123\" }) { id name displayName service avatar isQueuePaused } }"
  }'
```

Ответ:
```json
{
  "data": {
    "channels": [
      {
        "id": "5f7a8b9c0d1e2f3g4h5i6j7k",  ← ЭТО Channel ID (Profile ID)
        "name": "your_instagram",
        "displayName": "Your Instagram",
        "service": "instagram",
        "avatar": "https://...",
        "isQueuePaused": false
      }
    ]
  }
}
```

**3. Скопируйте значение `id`** — это ваш **Instagram Profile ID** (Channel ID)

### Шаг 5: Настройка в веб-интерфейсе

1. Откройте `/channels.html`
2. Перейдите на вкладку **Instagram**
3. Введите:
   - **Buffer API Key**: ваш токен из шага 3
   - **Instagram Profile ID**: ID из шага 4
4. Нажмите **🔗 Подключить через Buffer**
5. Настройте параметры публикации (лимиты, расписание)
6. Нажмите **💾 Сохранить настройки**

---

## Проверка работы

### Тестовый запрос через API

```bash
# Получите список профилей (проверка токена)
curl -H "Authorization: Bearer YOUR_BUFFER_API_KEY" \
  https://api.bufferapp.com/1/profiles.json

# Создайте тестовый пост
curl -X POST https://api.bufferapp.com/1/shares/create.json \
  -H "Authorization: Bearer YOUR_BUFFER_API_KEY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "profile_ids[]=YOUR_PROFILE_ID" \
  -d "text=Тестовый пост из Docker-Claw 🚀" \
  -d "now=true"
```

### Проверка через веб-интерфейс

1. Откройте `/channels.html`
2. Раздел **Instagram** должен показать статус «✅ Подключён»
3. Нажмите **🔄 Загрузить профили** — должен найтись ваш Instagram аккаунт

---

## Структура запроса к Buffer API

### 1. Загрузка изображения

```javascript
POST https://api.bufferapp.com/1/media.json

// Request
url=https://example.com/image.jpg
alt_text=Описание изображения

// Response
{
  "id": "media_123abc",
  "url": "https://buffer.com/media/123abc.jpg"
}
```

### 2. Создание поста

```javascript
POST https://api.bufferapp.com/1/shares/create.json

// Request
profile_ids[]=5f7a8b9c0d1e2f3g4h5i6j7k  // Instagram profile ID
text=Текст поста с хэштегами #instagram
media_ids[]=media_123abc                // ID загруженного изображения
now=true                                // Опубликовать сейчас
// или scheduled_at=2024-03-28T10:00:00Z

// Response
{
  "id": "share_456def",
  "profile_ids": ["5f7a8b9c0d1e2f3g4h5i6j7k"],
  "text": "Текст поста...",
  "scheduled_at": "2024-03-28T10:00:00Z"
}
```

---

## Устранение неполадок

### Ошибка: «Invalid access_token»

**Причина:** Токен истёк или отозван.

**Решение:**
1. Получите новый токен через OAuth flow (Шаг 3)
2. Обновите токен в настройках Instagram
3. Перезапустите сервер (если нужно)

### Ошибка: «Profile not found»

**Причина:** Неверный `Instagram Profile ID` или канал отключён.

**Решение:**
1. Проверьте ID через `/profiles.json` или GraphQL API
2. Убедитесь, что Instagram канал активен в Buffer
3. Обновите `Instagram Profile ID` в настройках

### Ошибка: «Rate limit exceeded»

**Причина:** Превышен лимит 60 запросов/мин.

**Решение:**
- Buffer автоматически делает retry с экспоненциальной задержкой
- Увеличьте интервал между публикациями

### Ошибка: «Media upload failed»

**Причина:** Недоступен публичный URL изображения.

**Решение:**
- Убедитесь, что изображение доступно по HTTPS
- Проверьте, что URL не требует авторизации

### Ошибка: «No profiles found» / «Профили не найдены»

**Причина:** В аккаунте Buffer нет подключённых Instagram каналов.

**Решение:**
1. Зайдите в личный кабинет Buffer.com
2. Убедитесь, что Instagram канал подключён и активен
3. Если канала нет — добавьте его через **Add Channel** → **Instagram**

---

## Сравнение: Buffer vs Direct API

### Код публикации через Buffer (упрощённо)

```javascript
const bufferService = require('./services/buffer.service');

await bufferService.publishToInstagram({
  accessToken: process.env.BUFFER_API_KEY,
  profileId: process.env.BUFFER_IG_PROFILE_ID,
  imageUrl: 'https://example.com/image.jpg',
  caption: 'Текст поста #instagram',
  now: true
});
```

### Код публикации через Instagram Graph API

```javascript
const instagramService = require('./services/instagram.service');

// Шаг 1: Создание контейнера
const container = await instagramService.createMediaContainer(igUserId, accessToken, {
  imageUrl: 'https://example.com/image.jpg',
  caption: 'Текст поста',
  mediaType: 'IMAGE'
});

// Шаг 2: Ожидание обработки (для видео)
// ... polling checkMediaStatus ...

// Шаг 3: Публикация
const result = await instagramService.publishMedia(igUserId, accessToken, container.id);
```

**Вывод:** Buffer требует в 3-5 раз меньше кода и не требует работы с polling статуса.

---

## Дополнительные возможности Buffer

### Отложенная публикация

```javascript
await bufferService.createShare(accessToken, {
  profileIds: [profileId],
  text: 'Текст поста',
  mediaIds: [mediaId],
  scheduled_at: '2024-03-29T10:00:00Z'  // ISO 8601
});
```

### Публикация в несколько каналов

```javascript
await bufferService.createShare(accessToken, {
  profileIds: [
    'instagram_profile_id',
    'facebook_page_id',
    'twitter_profile_id',
    'linkedin_profile_id'
  ],
  text: 'Текст поста',
  mediaIds: [mediaId],
  now: true
});
```

### Получение статистики через GraphQL

```bash
curl -X POST https://api.buffer.com/graphql \
  -H "Authorization: Bearer YOUR_BUFFER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query GetChannelStats { channel(id: \"YOUR_CHANNEL_ID\") { analytics { impressions engagements } } }"
  }'
```

---

## Ссылки

- [Buffer API Documentation](https://buffer.com/developers/api)
- [Buffer OAuth 2.0 Guide](https://buffer.com/developers/api/oauth)
- [Buffer GraphQL API](https://buffer.com/developers/api/graphql)
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api)
- [Docker-Claw README](../README.md)
