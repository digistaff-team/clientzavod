# Moderator User ID для каждого канала

## Дата реализации
29 марта 2026

## Проблема

Изначально параметр `Moderator User ID` задавался только в разделе **Контент-настройки Telegram** и применялся ко всем каналам (VK, OK, Instagram, Pinterest, Telegram). Это означало, что:

1. Все черновики отправлялись одному модератору
2. Невозможно было назначить разных модераторов для разных каналов
3. Если пользователь 399444307 хотел, чтобы VK модерировал один человек, а OK — другой, это было невозможно

## Решение

Добавлено поле **Moderator User ID** в настройки каждого канала с индивидуальным хранением и обработкой.

---

## Изменения в UI

### public/channels.html

Добавлены новые поля в настройки каналов:

#### VK канал
```html
<div id="vkModeratorBlock">
    <h4>👤 Модерация</h4>
    <label for="vkModeratorUserId">Moderator User ID</label>
    <input type="text" id="vkModeratorUserId" placeholder="123456789" />
    <p>Telegram ID модератора, который будет получать черновики для одобрения. По умолчанию — ваш ID.</p>
</div>
```

#### OK канал
```html
<div id="okModeratorBlock">
    <h4>👤 Модерация</h4>
    <label for="okModeratorUserId">Moderator User ID</label>
    <input type="text" id="okModeratorUserId" placeholder="123456789" />
    <p>Telegram ID модератора, который будет получать черновики для одобрения. По умолчанию — ваш ID.</p>
</div>
```

#### Instagram канал
```html
<div id="instagramModeratorBlock">
    <h4>👤 Модерация</h4>
    <label for="instagramModeratorUserId">Moderator User ID</label>
    <input type="text" id="instagramModeratorUserId" placeholder="123456789" />
    <p>Telegram ID модератора, который будет получать черновики для одобрения. По умолчанию — ваш ID.</p>
</div>
```

---

## Изменения в JavaScript (public/js/channels.js)

### Загрузка настроек
Обновлены функции загрузки для отображения `moderator_user_id`:

```javascript
// VK
const moderatorEl = document.getElementById('vkModeratorUserId');
if (moderatorEl) {
    moderatorEl.value = s.moderator_user_id || chatId;
}

// OK
const moderatorEl = document.getElementById('okModeratorUserId');
if (moderatorEl) {
    moderatorEl.value = s.moderator_user_id || chatId;
}

// Instagram
const moderatorEl = document.getElementById('instagramModeratorUserId');
if (moderatorEl) {
    moderatorEl.value = cfg.moderator_user_id || chatId;
}
```

### Сохранение настроек
Обновлены функции сохранения для отправки `moderator_user_id` на сервер:

```javascript
// VK
const moderatorUserId = (document.getElementById('vkModeratorUserId')?.value || '').trim() || chatId;
body: JSON.stringify({
    chat_id: chatId,
    // ... другие поля
    moderator_user_id: moderatorUserId
})

// OK, Instagram — аналогично
```

---

## Изменения в Backend API (manage/routes.js)

### POST /api/manage/channels/vk/settings
```javascript
const { moderator_user_id } = req.body;
manageStore.setVkSettings(chat_id, {
    // ... другие поля
    moderatorUserId: moderator_user_id
});
```

### POST /api/manage/channels/ok/settings
```javascript
const { moderator_user_id } = req.body;
manageStore.setOkSettings(chat_id, {
    // ... другие поля
    moderatorUserId: moderator_user_id
});
```

### POST /api/manage/channels/instagram
```javascript
const fields = [
    // ... другие поля
    'moderator_user_id'
];
```

---

## Изменения в хранилище (manage/store.js)

### setVkSettings, setOkSettings
```javascript
if (patch.moderatorUserId !== undefined) {
    next.moderatorUserId = String(patch.moderatorUserId || '').trim() || null;
}
```

### setInstagramConfig
```javascript
if (patch.moderator_user_id !== undefined) {
    next.moderator_user_id = String(patch.moderator_user_id || '').trim() || null;
}
```

### getVkSettings, getOkSettings
```javascript
return settings ? {
    ...settings,
    moderator_user_id: settings.moderatorUserId || null
} : null;
```

---

## Изменения в сервисах каналов

### Иерархия выбора модератора

Все сервисы обновлены для использования следующей иерархии:

```
1. moderatorUserId из настроек канала (vkSettings, okSettings, и т.д.)
   ↓ (если не задано)
2. moderatorUserId из глобальных контент-настроек Telegram
   ↓ (если не задано)
3. CONTENT_MVP_MODERATOR_USER_ID из .env
   ↓ (если не задано)
4. chatId пользователя (владелец контейнера)
```

### VK (services/vkMvp.service.js)
```javascript
async function sendVkToModerator(chatId, bot, draft) {
  const vkSettings = getVkSettings(chatId);
  const globalSettings = manageStore.getContentSettings?.(chatId);
  
  const moderatorId = vkSettings?.moderatorUserId || 
                      globalSettings?.moderatorUserId || 
                      chatId;
  
  // Отправка черновика модератору
}
```

### OK (services/okMvp.service.js)
```javascript
async function sendOkToModerator(chatId, bot, draft) {
  const okSettings = getOkSettings(chatId);
  const globalSettings = manageStore.getContentSettings?.(chatId);
  
  const moderatorId = okSettings?.moderatorUserId || 
                      globalSettings?.moderatorUserId || 
                      chatId;
  
  // Отправка черновика модератору
}
```

### Instagram (services/instagramMvp.service.js)
```javascript
async function sendIgToModerator(chatId, bot, draft) {
  const igSettings = getIgSettings(chatId);
  const globalSettings = manageStore.getContentSettings?.(chatId);
  
  const moderatorId = igSettings?.moderator_user_id || 
                      globalSettings?.moderatorUserId || 
                      chatId;
  
  // Отправка черновика модератору
}
```

### Pinterest (services/pinterestMvp.service.js)
```javascript
async function sendPinToModerator(chatId, bot, draft) {
  const settings = getPinterestSettings(chatId);
  const globalSettings = manageStore.getContentSettings?.(chatId);
  
  const moderatorId = settings.moderatorUserId || 
                      globalSettings?.moderatorUserId || 
                      chatId;
  
  // Отправка черновика модератору
}
```

---

## Изменения в обработчиках callback (manage/telegram/runner.js)

### Проверка доступа модератора

Все callback-обработчики обновлены для проверки доступа через **модератора канала**, а не глобального модератора.

#### VK moderation callback
```javascript
bot.action(/^vk_mod:(\d+):(approve|reject|regen_text|regen_image)$/, async (ctx) => {
    // Поиск черновика по jobId
    for (const [cid, data] of Object.entries(allStates)) {
        const drafts = data.vkDrafts || {};
        if (!drafts[String(jobId)]) continue;
        
        // Проверяем доступ через модератора VK канала
        const vkSettings = manageStore.getVkSettings?.(cid) || {};
        const globalSettings = data.contentSettings || {};
        const channelModeratorId = vkSettings.moderatorUserId || 
                                   globalSettings.moderatorUserId || 
                                   process.env.CONTENT_MVP_MODERATOR_USER_ID;
        
        const ownerTgId = String(data.verifiedTelegramId || '');
        const allowedIds = new Set([ownerTgId, channelModeratorId].filter(Boolean));
        
        if (allowedIds.has(fromId)) {
            resolvedChatId = cid;
            break;
        }
    }
    
    // Обработка модерации
});
```

#### OK, Instagram, Pinterest — аналогично

---

## Сценарии использования

### Сценарий 1: Один модератор для всех каналов
Пользователь не заполняет `Moderator User ID` в настройках каналов → используется глобальный модератор из контент-настроек Telegram.

### Сценарий 2: Разные модераторы для разных каналов
Пользователь 399444307 настраивает:
- **VK Moderator User ID**: 8092697980
- **OK Moderator User ID**: 128247430
- **Instagram Moderator User ID**: (пусто → используется глобальный)

Результат:
- Черновики VK отправляются модератору 8092697980
- Черновики OK отправляются модератору 128247430
- Черновики Instagram отправляются глобальному модератору

### Сценарий 3: Модератор не заполнен
Если `Moderator User ID` не указан ни в канале, ни в глобальных настройках → черновики отправляются владельцу контейнера (chatId).

---

## Проверка доступа к callback-кнопкам

Когда модератор нажимает кнопку **Approve** под черновиком:

1. Обработчик ищет черновик по `jobId` во всех состояниях
2. Для каждого состояния проверяется:
   - Есть ли черновик с этим `jobId` в соответствующем поле (`vkDrafts`, `okDrafts`, и т.д.)
   - Является ли нажавший пользователь (`fromId`) владельцем ИЛИ модератором **этого канала**
3. Если доступ подтверждён → выполняется действие модерации

### Пример проверки для VK
```javascript
const vkSettings = manageStore.getVkSettings?.(cid) || {};
const channelModeratorId = vkSettings.moderatorUserId || 
                           globalSettings.moderatorUserId || 
                           process.env.CONTENT_MVP_MODERATOR_USER_ID;

const allowedIds = new Set([ownerTgId, channelModeratorId].filter(Boolean));

if (allowedIds.has(fromId)) {
    // Доступ разрешён
}
```

---

## Достигнутые результаты

1. ✅ Каждый канал может иметь своего модератора
2. ✅ Черновики отправляются правильному модератору
3. ✅ Callback-кнопки проверяют доступ через модератора канала
4. ✅ Сохранена обратная совместимость (глобальный модератор работает как фоллбэк)
5. ✅ По умолчанию используется chatId пользователя (если модератор не указан)

---

## Файлы, изменённые в ходе реализации

### Frontend
- `public/channels.html` — UI поля для Moderator User ID
- `public/js/channels.js` — загрузка/сохранение настроек

### Backend
- `manage/routes.js` — API endpoints
- `manage/store.js` — хранение настроек
- `manage/telegram/runner.js` — callback-обработчики

### Сервисы
- `services/vkMvp.service.js` — отправка черновиков VK
- `services/okMvp.service.js` — отправка черновиков OK
- `services/instagramMvp.service.js` — отправка черновиков Instagram
- `services/pinterestMvp.service.js` — отправка черновиков Pinterest

---

## Тестирование

### Проверка UI
1. Открыть панель управления каналом (VK/OK/Instagram)
2. Убедиться, что поле "Moderator User ID" отображается
3. Заполнить поле, сохранить настройки
4. Перезагрузить страницу — значение должно сохраниться

### Проверка отправки черновиков
1. Сгенерировать черновик для канала с индивидуальным модератором
2. Убедиться, что черновик получен правильным модератором в Telegram

### Проверка callback-кнопок
1. Модератор канала нажимает Approve → черновик одобрен, пост опубликован
2. Пользователь, не являющийся модератором, нажимает Approve → ошибка "Недостаточно прав"

---

## Заключение

Реализована возможность назначения индивидуального модератора для каждого канала (VK, OK, Instagram, Pinterest). Система использует иерархию настроек с фоллбэком на глобального модератора и chatId пользователя. Обработчики callback-кнопок корректно проверяют доступ через модератора конкретного канала.
