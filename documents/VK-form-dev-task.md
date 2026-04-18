# Задание на разработку: Форма настроек канала VK

## Цель
Реализовать UI форму подключения и настройки канала VK в `channels.html` по аналогии с уже реализованными каналами Telegram и Pinterest.

---

## 1. Обновить `public/channels.html`

### 1.1. Заменить заглушку VK панели

**Текущий код:**
```html
<!-- VK -->
<div class="channel-panel" id="channelPanel-vk" style="display: none;">
    <div class="channel-card">
        <h3>🔵 VK</h3>
        <p>Публикация в сообщества и на стену. Подключение через VK API.</p>
        <p style="color: #999; font-style: italic;">Скоро будет доступно. Канал находится в разработке.</p>
    </div>
</div>
```

**Новый код:** Развернуть полную форму с двумя секциями:
- **Секция авторизации:** Group ID, Service Key
- **Секция настроек публикации:** (аналогично Telegram) с VK-специфичными полями

### 1.2. Структура формы VK

```
┌─────────────────────────────────────────────────────┐
│ 🔵 VK                                                │
├─────────────────────────────────────────────────────┤
│ [Авторизация]                                        │
│ ┌──────────────────┐ ┌──────────────────┐          │
│ │ Group ID         │ │ Service Key      │          │
│ │ [input]          │ │ [password]       │          │
│ └──────────────────┘ └──────────────────┘          │
│ [💾 Сохранить токен] [Отключить]                    │
│ [Статус подключения]                                 │
├─────────────────────────────────────────────────────┤
│ [Настройки публикации]                               │
│ ┌──────────────────┐ ┌──────────────────┐          │
│ │ Schedule Time    │ │ Schedule TZ      │          │
│ │ [HH:MM]          │ │ [select]         │          │
│ └──────────────────┘ └──────────────────┘          │
│ ┌──────────────────┐ ┌──────────────────┐          │
│ │ Daily Limit      │ │ Периодичность    │          │
│ │ [number]         │ │ [select]         │          │
│ └──────────────────┘ └──────────────────┘          │
│ Дни недели: [Пн][Вт][Ср][Чт][Пт][Сб][Вс] [Рандом]  │
│ [☑] Включить премодерацию                           │
│ ┌──────────────────┐                                │
│ │ Тип поста        │                                │
│ │ [post/article/   │                                │
│ │  video]          │                                │
│ └──────────────────┘                                │
│ [Сохранить настройки]                                │
└─────────────────────────────────────────────────────┘
```

### 1.3. Полный HTML-код для вставки

```html
<!-- VK -->
<div class="channel-panel" id="channelPanel-vk" style="display: none;">
    <div class="channel-card">
        <h3>🔵 VK</h3>
        <p>Публикация в сообщества и на стену. Подключение через VK API.</p>

        <!-- Авторизация -->
        <div id="vkAuthBlock">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <div>
                    <label for="vkGroupId">Group ID</label>
                    <input type="text" id="vkGroupId" placeholder="123456789" />
                </div>
                <div>
                    <label for="vkServiceKey">Service Key</label>
                    <input type="password" id="vkServiceKey" placeholder="VK Service Key" autocomplete="off" />
                </div>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                <button class="btn btn-primary" onclick="saveVkToken()">💾 Сохранить токен</button>
                <button class="btn btn-secondary" id="disconnectVkBtn" style="display: none;" onclick="disconnectVk()">Отключить</button>
            </div>
        </div>
        <div id="vkStatus" class="channel-status" style="margin-top: 14px; font-size: 14px;"></div>

        <!-- Настройки публикации -->
        <div id="vkSettingsBlock" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
            <h3 style="margin-bottom: 12px;">Настройки публикации</h3>
            <p style="color: #666; margin-bottom: 16px; font-size: 13px;">Настройки публикации контента в VK: расписание, лимиты, дни недели.</p>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <!-- Schedule Time -->
                <div>
                    <label for="vkScheduleTime">Schedule Time (HH:MM)</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <select id="vkScheduleHour" style="width: 80px; margin-bottom: 0;" onchange="updateVkScheduleTime()">
                            <option value="00">00</option><option value="01">01</option><option value="02">02</option><option value="03">03</option>
                            <option value="04">04</option><option value="05">05</option><option value="06">06</option><option value="07">07</option>
                            <option value="08">08</option><option value="09">09</option><option value="10">10</option><option value="11">11</option>
                            <option value="12">12</option><option value="13">13</option><option value="14">14</option><option value="15">15</option>
                            <option value="16">16</option><option value="17">17</option><option value="18">18</option><option value="19">19</option>
                            <option value="20">20</option><option value="21">21</option><option value="22">22</option><option value="23">23</option>
                        </select>
                        <span style="font-size: 18px; font-weight: 600;">:</span>
                        <input type="text" id="vkScheduleMinute" placeholder="00" style="width: 70px; margin-bottom: 0; text-align: center;" maxlength="2" onchange="validateVkMinutes()" oninput="validateVkMinutes()" />
                        <input type="hidden" id="vkScheduleTime" />
                    </div>
                </div>
                
                <!-- Schedule TZ -->
                <div>
                    <label for="vkScheduleTz">Schedule TZ</label>
                    <select id="vkScheduleTz" onchange="updateVkScheduleTz()">
                        <option value="UTC">UTC (Coordinated Universal Time)</option>
                        <option value="Europe/Moscow" selected>Europe/Moscow (UTC+3)</option>
                        <option value="Europe/Kiev">Europe/Kiev (UTC+2)</option>
                        <option value="Europe/Minsk">Europe/Minsk (UTC+3)</option>
                        <option value="Europe/London">Europe/London (UTC+0)</option>
                        <option value="Europe/Berlin">Europe/Berlin (UTC+1)</option>
                        <option value="Europe/Paris">Europe/Paris (UTC+1)</option>
                        <option value="Asia/Almaty">Asia/Almaty (UTC+5)</option>
                        <option value="Asia/Tashkent">Asia/Tashkent (UTC+5)</option>
                        <option value="Asia/Yekaterinburg">Asia/Yekaterinburg (UTC+5)</option>
                        <option value="Asia/Novosibirsk">Asia/Novosibirsk (UTC+7)</option>
                        <option value="Asia/Vladivostok">Asia/Vladivostok (UTC+10)</option>
                    </select>
                </div>
                
                <!-- Daily Limit -->
                <div>
                    <label for="vkDailyLimit">Daily Limit</label>
                    <input type="number" id="vkDailyLimit" min="1" placeholder="5" />
                </div>
                
                <!-- Publish Interval -->
                <div>
                    <label for="vkPublishInterval">Периодичность публикаций</label>
                    <select id="vkPublishInterval">
                        <option value="0.5">Каждые 30 мин.</option>
                        <option value="1">Каждый час</option>
                        <option value="3">Каждые 3 часа</option>
                        <option value="5">Каждые 5 часов</option>
                        <option value="12">Каждые 12 часов</option>
                        <option value="24" selected>Раз в сутки</option>
                    </select>
                </div>
            </div>
            
            <!-- Weekdays + Random -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 13px; font-weight: 600; color: #495057; position: relative; top: -4px;">Дни недели:</span>
                    <label><input type="checkbox" value="1" id="vkWeekday1" checked> Пн</label>
                    <label><input type="checkbox" value="2" id="vkWeekday2" checked> Вт</label>
                    <label><input type="checkbox" value="3" id="vkWeekday3" checked> Ср</label>
                    <label><input type="checkbox" value="4" id="vkWeekday4" checked> Чт</label>
                    <label><input type="checkbox" value="5" id="vkWeekday5" checked> Пт</label>
                    <label><input type="checkbox" value="6" id="vkWeekday6"> Сб</label>
                    <label><input type="checkbox" value="0" id="vkWeekday0"> Вс</label>
                </div>
                <label style="cursor: pointer; white-space: nowrap;">
                    <input type="checkbox" id="vkRandomPublish" style="margin-right: 4px;">Рандом
                </label>
            </div>
            
            <!-- Premoderation -->
            <div style="margin-bottom: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" id="vkPremoderation" checked />
                    <span>Включить премодерацию</span>
                </label>
                <p style="color: #666; font-size: 12px; margin-top: 4px;">Если включено — контент будет отправляться в Telegram-бот на согласование перед публикацией.</p>
            </div>
            
            <!-- VK-specific: Post Type -->
            <div style="margin-bottom: 12px;">
                <label for="vkPostType">Тип поста по умолчанию</label>
                <select id="vkPostType">
                    <option value="post">Пост</option>
                    <option value="article">Статья (лонгрид)</option>
                    <option value="video">Видео</option>
                </select>
                <p style="color: #666; font-size: 12px; margin-top: 4px;">
                    <strong>Пост</strong> — обычная запись на стене.<br>
                    <strong>Статья</strong> — лонгрид с форматированием (аналог Telegraph).<br>
                    <strong>Видео</strong> — загрузка видео в раздел Видео.
                </p>
            </div>
            
            <button class="btn btn-success" onclick="saveVkSettings()">Сохранить настройки</button>
            <div id="vkSettingsStatus" style="margin-top: 10px; font-size: 13px;"></div>
        </div>
    </div>
</div>
```

---

## 2. Обновить `public/js/channels.js`

### 2.1. Добавить функции для VK

| Функция | Описание |
|---------|----------|
| `loadVkStatus()` | Загрузка текущих настроек VK через API |
| `saveVkToken()` | Сохранение Group ID и Service Key |
| `disconnectVk()` | Отключение канала VK |
| `saveVkSettings()` | Сохранение настроек публикации |
| `updateVkScheduleTime()` | Обновление поля времени (аналог `updateScheduleTime`) |
| `validateVkMinutes()` | Валидация минут (аналог `validateMinutes`) |
| `updateVkScheduleTz()` | Обновление часового пояса |

### 2.2. Реализация функций

Вставить после функций Pinterest (после `savePinterestConfig`):

```javascript
// === VKontakte ===

function updateVkScheduleTime() {
    const hour = document.getElementById('vkScheduleHour')?.value || '00';
    const minute = document.getElementById('vkScheduleMinute')?.value || '00';
    const timeField = document.getElementById('vkScheduleTime');
    if (timeField) {
        timeField.value = `${hour}:${minute.padStart(2, '0')}`;
    }
}

function validateVkMinutes() {
    const minuteInput = document.getElementById('vkScheduleMinute');
    if (!minuteInput) return;
    let val = minuteInput.value.replace(/[^0-9]/g, '');
    if (val.length > 2) val = val.slice(0, 2);
    if (val !== '' && parseInt(val, 10) > 59) val = '59';
    minuteInput.value = val;
    updateVkScheduleTime();
}

function updateVkScheduleTz() {
    return;
}

function setVkScheduleTimeInputs(timeValue) {
    if (!timeValue) return;
    const parts = timeValue.split(':');
    if (parts.length < 2) return;
    const hourSelect = document.getElementById('vkScheduleHour');
    const minuteInput = document.getElementById('vkScheduleMinute');
    if (hourSelect) hourSelect.value = parts[0].padStart(2, '0');
    if (minuteInput) minuteInput.value = parts[1].padStart(2, '0');
    updateVkScheduleTime();
}

async function loadVkStatus() {
    const chatId = getChatId();
    if (!chatId) return;
    try {
        const res = await fetch(`${API_MANAGE}/channels/vk?chat_id=${encodeURIComponent(chatId)}`);
        const data = await res.json();
        const statusEl = document.getElementById('vkStatus');
        const disconnectBtn = document.getElementById('disconnectVkBtn');
        const settingsBlock = document.getElementById('vkSettingsBlock');
        if (!statusEl) return;

        if (data.connected) {
            statusEl.innerHTML = '<span style="color: #0a0;">✅ VK подключён</span>';
            if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
            if (settingsBlock) settingsBlock.style.display = 'block';
            
            // Заполняем поля формы сохранёнными значениями
            const cfg = data.config || {};
            if (cfg.group_id) document.getElementById('vkGroupId').value = cfg.group_id;
            if (cfg.service_key) document.getElementById('vkServiceKey').value = cfg.service_key;
            
            // Заполняем настройки публикации
            const s = data.settings || {};
            if (s.schedule_time) {
                document.getElementById('vkScheduleTime').value = s.schedule_time;
                setVkScheduleTimeInputs(s.schedule_time);
            }
            const tzSelect = document.getElementById('vkScheduleTz');
            if (tzSelect && s.schedule_tz) {
                const optionExists = Array.from(tzSelect.options).some((opt) => opt.value === s.schedule_tz);
                if (optionExists) {
                    tzSelect.value = s.schedule_tz;
                } else {
                    const newOption = document.createElement('option');
                    newOption.value = s.schedule_tz;
                    newOption.text = `${s.schedule_tz} (custom)`;
                    newOption.selected = true;
                    tzSelect.insertBefore(newOption, tzSelect.firstChild);
                }
            }
            if (s.daily_limit) document.getElementById('vkDailyLimit').value = s.daily_limit;
            const intervalEl = document.getElementById('vkPublishInterval');
            if (intervalEl) intervalEl.value = String(s.publish_interval_hours ?? 24);
            const randomEl = document.getElementById('vkRandomPublish');
            if (randomEl) randomEl.checked = !!s.random_publish;
            const premoderEl = document.getElementById('vkPremoderation');
            if (premoderEl) premoderEl.checked = s.premoderation_enabled !== false;
            const postTypeEl = document.getElementById('vkPostType');
            if (postTypeEl) postTypeEl.value = s.post_type || 'post';
            
            // Дни недели
            const weekdays = Array.isArray(s.allowed_weekdays) ? s.allowed_weekdays : [1, 2, 3, 4, 5];
            for (let d = 0; d <= 6; d++) {
                const cb = document.getElementById('vkWeekday' + d);
                if (cb) cb.checked = weekdays.includes(d);
            }
        } else {
            statusEl.textContent = '';
            if (disconnectBtn) disconnectBtn.style.display = 'none';
            if (settingsBlock) settingsBlock.style.display = 'none';
        }
    } catch (e) {
        console.error('loadVkStatus', e);
    }
}

async function saveVkToken() {
    const chatId = getChatId();
    if (!chatId) return;
    const groupId = document.getElementById('vkGroupId')?.value?.trim();
    const serviceKey = document.getElementById('vkServiceKey')?.value?.trim();
    
    if (!groupId || !serviceKey) {
        showToast('Введите Group ID и Service Key', 'error');
        return;
    }
    
    try {
        const res = await fetch(`${API_MANAGE}/channels/vk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                group_id: groupId,
                service_key: serviceKey
            })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('VK подключён', 'success');
            await loadVkStatus();
        } else {
            showToast(data.error || 'Ошибка подключения', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

async function disconnectVk() {
    const chatId = getChatId();
    if (!chatId || !confirm('Отключить VK для этого окружения?')) return;
    try {
        const res = await fetch(`${API_MANAGE}/channels/vk?chat_id=${encodeURIComponent(chatId)}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('VK отключён', 'success');
            await loadVkStatus();
        } else {
            showToast('Ошибка отключения', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

async function saveVkSettings() {
    const chatId = getChatId();
    if (!chatId) return;
    updateVkScheduleTime();
    
    try {
        const res = await fetch(`${API_MANAGE}/channels/vk/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                schedule_time: (document.getElementById('vkScheduleTime')?.value || '').trim(),
                schedule_tz: (document.getElementById('vkScheduleTz')?.value || '').trim(),
                daily_limit: (document.getElementById('vkDailyLimit')?.value || '').trim(),
                publish_interval_hours: parseFloat(document.getElementById('vkPublishInterval')?.value || '24'),
                random_publish: !!document.getElementById('vkRandomPublish')?.checked,
                premoderation_enabled: !!document.getElementById('vkPremoderation')?.checked,
                post_type: (document.getElementById('vkPostType')?.value || 'post').trim(),
                allowed_weekdays: [0,1,2,3,4,5,6].filter(d => document.getElementById('vkWeekday' + d)?.checked)
            })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('Настройки VK сохранены', 'success');
            await loadVkStatus();
        } else {
            showToast(data.error || 'Ошибка сохранения', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}
```

### 2.3. Обновить `onLoginSuccess()`

Добавить вызов `await loadVkStatus();`:

```javascript
async function onLoginSuccess() {
    await loadTelegramStatus();
    await loadEmailStatus();
    await loadContentSettings();
    await loadPinterestConfig();
    await loadVkStatus();  // ← Добавить эту строку
}
```

---

## 3. Обновить `manage/routes.js`

### 3.1. Добавить API endpoints

| Endpoint | Method | Описание |
|----------|--------|----------|
| `GET /api/manage/channels/vk` | GET | Получить настройки VK |
| `POST /api/manage/channels/vk` | POST | Сохранить Group ID и Service Key |
| `DELETE /api/manage/channels/vk` | DELETE | Отключить VK |
| `POST /api/manage/channels/vk/settings` | POST | Сохранить настройки публикации |

### 3.2. Реализация endpoints

Вставить после endpoints для Pinterest:

```javascript
// === VKontakte Channel ===

router.get('/channels/vk', async (req, res) => {
    try {
        const chatId = req.query.chat_id;
        if (!chatId) {
            return res.status(400).json({ error: 'chat_id is required' });
        }
        
        const vkConfig = store.getVkConfig(chatId);
        const vkSettings = store.getVkSettings(chatId);
        
        res.json({
            connected: !!vkConfig?.group_id,
            config: vkConfig || {},
            settings: vkSettings || {}
        });
    } catch (e) {
        console.error('GET /api/manage/channels/vk', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/channels/vk', async (req, res) => {
    try {
        const { chat_id, group_id, service_key } = req.body;
        if (!chat_id || !group_id || !service_key) {
            return res.status(400).json({ error: 'chat_id, group_id, and service_key are required' });
        }
        
        store.setVkConfig(chat_id, {
            group_id,
            service_key,
            is_active: true,
            connected_at: new Date().toISOString()
        });
        
        res.json({ success: true });
    } catch (e) {
        console.error('POST /api/manage/channels/vk', e);
        res.status(500).json({ error: e.message });
    }
});

router.delete('/channels/vk', async (req, res) => {
    try {
        const chatId = req.query.chat_id;
        if (!chatId) {
            return res.status(400).json({ error: 'chat_id is required' });
        }
        
        store.setVkConfig(chatId, {});
        store.setVkSettings(chatId, {});
        
        res.json({ success: true });
    } catch (e) {
        console.error('DELETE /api/manage/channels/vk', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/channels/vk/settings', async (req, res) => {
    try {
        const {
            chat_id,
            schedule_time,
            schedule_tz,
            daily_limit,
            publish_interval_hours,
            random_publish,
            premoderation_enabled,
            post_type,
            allowed_weekdays
        } = req.body;
        
        if (!chat_id) {
            return res.status(400).json({ error: 'chat_id is required' });
        }
        
        store.setVkSettings(chat_id, {
            schedule_time,
            schedule_tz,
            daily_limit,
            publish_interval_hours,
            random_publish,
            premoderation_enabled,
            post_type,
            allowed_weekdays
        });
        
        res.json({ success: true });
    } catch (e) {
        console.error('POST /api/manage/channels/vk/settings', e);
        res.status(500).json({ error: e.message });
    }
});
```

---

## 4. Обновить `manage/store.js`

### 4.1. Добавить функции состояния VK

Вставить после функций Pinterest (после `setPinterestConfig`):

```javascript
// === VK Config ===

function getVkConfig(chatId) {
    const data = statesCache[chatId];
    return data?.vkConfig || null;
}

function setVkConfig(chatId, patch = {}) {
    if (!statesCache[chatId]) statesCache[chatId] = {};
    const current = statesCache[chatId].vkConfig || {};
    const next = { ...current };

    if (patch.group_id !== undefined) next.group_id = String(patch.group_id || '').trim() || null;
    if (patch.service_key !== undefined) next.service_key = patch.service_key || null;
    if (patch.is_active !== undefined) next.is_active = !!patch.is_active;
    if (patch.connected_at !== undefined) next.connected_at = patch.connected_at;

    statesCache[chatId].vkConfig = next;
    return persist(chatId);
}

// === VK Settings ===

function getVkSettings(chatId) {
    const data = statesCache[chatId];
    return data?.vkSettings || null;
}

function setVkSettings(chatId, patch = {}) {
    if (!statesCache[chatId]) statesCache[chatId] = {};
    const current = statesCache[chatId].vkSettings || {};
    const next = { ...current };

    if (patch.schedule_time !== undefined) {
        const scheduleTime = String(patch.schedule_time || '').trim();
        if (scheduleTime && !/^\d{2}:\d{2}$/.test(scheduleTime)) {
            throw new Error('schedule_time must be in HH:MM format');
        }
        next.schedule_time = scheduleTime || null;
    }
    
    if (patch.schedule_tz !== undefined) {
        next.schedule_tz = String(patch.schedule_tz || '').trim() || null;
    }
    
    if (patch.daily_limit !== undefined) {
        if (patch.daily_limit === null || patch.daily_limit === '') {
            next.daily_limit = null;
        } else {
            const parsedLimit = parseInt(patch.daily_limit, 10);
            if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
                throw new Error('daily_limit must be a positive integer');
            }
            next.daily_limit = parsedLimit;
        }
    }

    if (patch.random_publish !== undefined) {
        next.random_publish = !!patch.random_publish;
    }
    
    if (patch.premoderation_enabled !== undefined) {
        next.premoderation_enabled = !!patch.premoderation_enabled;
    }
    
    if (patch.publish_interval_hours !== undefined) {
        const allowed = [0.5, 1, 3, 5, 12, 24];
        const val = parseFloat(patch.publish_interval_hours);
        if (!allowed.includes(val)) {
            throw new Error('publish_interval_hours must be one of: ' + allowed.join(', '));
        }
        next.publish_interval_hours = val;
    }
    
    if (patch.allowed_weekdays !== undefined) {
        if (!Array.isArray(patch.allowed_weekdays)) {
            throw new Error('allowed_weekdays must be an array');
        }
        const days = patch.allowed_weekdays
            .map(d => parseInt(d, 10))
            .filter(d => Number.isFinite(d) && d >= 0 && d <= 6);
        next.allowed_weekdays = [...new Set(days)].sort();
    }
    
    if (patch.post_type !== undefined) {
        const allowedTypes = ['post', 'article', 'video'];
        const postType = String(patch.post_type || '').trim().toLowerCase();
        if (!allowedTypes.includes(postType)) {
            throw new Error('post_type must be one of: ' + allowedTypes.join(', '));
        }
        next.post_type = postType;
    }

    statesCache[chatId].vkSettings = next;
    return persist(chatId);
}
```

---

## 5. Интеграция с базой данных

### 5.1. Таблица `content_channels`

При сохранении настроек VK создавать/обновлять запись в `content_channels`:

```sql
-- Пример записи для VK
INSERT INTO content_channels (
    user_id, 
    channel_name, 
    channel_type,
    channel_id, 
    channel_name_display, 
    channel_username,
    auth_type, 
    access_token, 
    api_key,
    is_active, 
    auto_publish, 
    schedule_timezone,
    daily_limit, 
    posting_hours, 
    channel_metadata
) VALUES (
    '128247430',           -- user_id (chat_id)
    'vk',                  -- channel_name
    'social',              -- channel_type
    '123456789',           -- channel_id (group_id)
    'Мой бизнес',          -- channel_name_display
    'my_business',         -- channel_username
    'api_key',             -- auth_type
    NULL,                  -- access_token
    'encrypted_service_key', -- api_key (шифровать!)
    true,                  -- is_active
    false,                 -- auto_publish
    'Europe/Moscow',       -- schedule_timezone
    5,                     -- daily_limit
    '{"start": "09:00", "end": "21:00", "days": [1,2,3,4,5]}', -- posting_hours
    '{"post_type": "post", "enable_comments": true, "signed": false}'::jsonb -- channel_metadata
)
ON CONFLICT (user_id, channel_name, channel_id) 
DO UPDATE SET
    channel_name_display = EXCLUDED.channel_name_display,
    channel_username = EXCLUDED.channel_username,
    api_key = EXCLUDED.api_key,
    is_active = EXCLUDED.is_active,
    auto_publish = EXCLUDED.auto_publish,
    schedule_timezone = EXCLUDED.schedule_timezone,
    daily_limit = EXCLUDED.daily_limit,
    posting_hours = EXCLUDED.posting_hours,
    channel_metadata = EXCLUDED.channel_metadata,
    updated_at = NOW();
```

### 5.2. Таблица `content_queue` → `channel_config`

Для каждой публикации VK в `channel_config` сохраняется:

```json
{
  "group_id": "123456789",
  "post_type": "post",
  "attach": [],
  "services": [],
  "friend_only": false,
  "copyright": "https://example.com",
  "signed": false,
  "enable_comments": true,
  "donut_paid_duration": 0
}
```

---

## 6. Критерии приёмки

- [ ] Форма VK отображается при переключении на вкладку "VK"
- [ ] Поля Group ID и Service Key сохраняются и загружаются
- [ ] Настройки публикации (время, TZ, лимиты, дни недели) работают аналогично Telegram
- [ ] Чекбокс "Рандом" активирует случайный интервал до следующей публикации
- [ ] Выпадающий список "Тип поста" содержит: post, article, video
- [ ] Кнопка "Сохранить настройки" отправляет данные на сервер
- [ ] Статус подключения отображается после загрузки
- [ ] Кнопка "Отключить" удаляет настройки VK
- [ ] Валидация времени (HH:MM) работает корректно
- [ ] Валидация минут (00-59) работает корректно
- [ ] Дни недели сохраняются в массиве (0-6)
- [ ] Часовой пояс сохраняется и загружается

---

## 7. Ссылки на реализацию

### Файлы для редактирования

| Файл | Строки | Описание |
|------|--------|----------|
| `public/channels.html` | ~260-270 | Заменить заглушку VK на полную форму |
| `public/js/channels.js` | ~550-600 | Добавить функции VK (после Pinterest) |
| `manage/routes.js` | ~500-600 | Добавить API endpoints (после Pinterest) |
| `manage/store.js` | ~550-650 | Добавить функции состояния (после Pinterest) |

### Референсы

- **Telegram:** `public/channels.html` строки 60-180, `public/js/channels.js` функции `loadTelegramStatus`, `saveTelegramToken`
- **Pinterest:** `public/channels.html` строки 182-260, `public/js/channels.js` функции `loadPinterestConfig`, `savePinterestConfig`
- **Store:** `manage/store.js` функции `setContentSettings` (строки 463-522), `setPinterestConfig` (строки 530-570)
- **Routes:** `manage/routes.js` endpoints `/api/manage/channels/pinterest` (строки ~450-500)

---

## 8. Дополнительные задачи (опционально)

### 8.1. Шифрование Service Key

```javascript
// В manage/routes.js при сохранении
const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';

function encrypt(text) {
    const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

function decrypt(text) {
    const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
```

### 8.2. Тестирование VK API

Создать файл `test/vk-api.test.js` для проверки:
- Подключения к VK API
- Публикации поста
- Публикации статьи
- Публикации видео

---

## 9. Примечания

1. **VK API Documentation:** https://dev.vk.com/ru/api
2. **Service Key** создаётся в разделе разработчика VK: https://dev.vk.com/
3. **Group ID** можно узнать через метод `groups.getById` или из URL группы
4. Для публикации **статей** используется метод `wall.createArticle` + `wall.post`
5. Для публикации **видео** используется метод `video.save` + загрузка файла
