# Задание на разработку: Форма настроек канала OK (Одноклассники)

## Цель
Реализовать UI форму подключения и настройки канала OK (Одноклассники) в `channels.html` по аналогии с уже реализованными каналами Telegram, Pinterest и VK.

---

## 1. Обновить `public/channels.html`

### 1.1. Заменить заглушку OK панели

**Текущий код:**
```html
<!-- Одноклассники -->
<div class="channel-panel" id="channelPanel-ok" style="display: none;">
    <div class="channel-card">
        <h3>🟠 Одноклассники</h3>
        <p>Публикация в группы и на стену. Подключение через OK API.</p>
        <p style="color: #999; font-style: italic;">Скоро будет доступно. Канал находится в разработке.</p>
    </div>
</div>
```

**Новый код:** Развернуть полную форму с двумя секциями:
- **Секция авторизации:** Group ID, App ID, API Key, Secret Key
- **Секция настроек публикации:** (аналогично Telegram/VK) с OK-специфичными полями

### 1.2. Структура формы OK

```
┌─────────────────────────────────────────────────────┐
│ 🟠 Одноклассники                                     │
├─────────────────────────────────────────────────────┤
│ [Авторизация]                                        │
│ ┌──────────────────┐ ┌──────────────────┐          │
│ │ Group ID         │ │ App ID           │          │
│ │ [input]          │ │ [input]          │          │
│ └──────────────────┘ └──────────────────┘          │
│ ┌──────────────────┐ ┌──────────────────┐          │
│ │ API Key          │ │ Secret Key       │          │
│ │ [password]       │ │ [password]       │          │
│ └──────────────────┘ └──────────────────┘          │
│ [💾 Сохранить ключи] [Отключить]                    │
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
│ │ [post/video/     │                                │
│ │  album]          │                                │
│ └──────────────────┘                                │
│ ┌──────────────────┐                                │
│ │ Age restrict     │                                │
│ │ [0+/6+/12+/16+/  │                                │
│ │  18+]            │                                │
│ └──────────────────┘                                │
│ [Сохранить настройки]                                │
└─────────────────────────────────────────────────────┘
```

### 1.3. Полный HTML-код для вставки

```html
<!-- Одноклассники -->
<div class="channel-panel" id="channelPanel-ok" style="display: none;">
    <div class="channel-card">
        <h3>🟠 Одноклассники</h3>
        <p>Публикация в группы и на стену. Подключение через OK API.</p>

        <!-- Авторизация -->
        <div id="okAuthBlock">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <div>
                    <label for="okGroupId">Group ID</label>
                    <input type="text" id="okGroupId" placeholder="123456789" />
                </div>
                <div>
                    <label for="okAppId">App ID</label>
                    <input type="text" id="okAppId" placeholder="OK App ID" />
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <div>
                    <label for="okApiKey">API Key</label>
                    <input type="password" id="okApiKey" placeholder="OK API Key" autocomplete="off" />
                </div>
                <div>
                    <label for="okSecretKey">Secret Key</label>
                    <input type="password" id="okSecretKey" placeholder="OK Secret Key" autocomplete="off" />
                </div>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                <button class="btn btn-primary" onclick="saveOkKeys()">💾 Сохранить ключи</button>
                <button class="btn btn-secondary" id="disconnectOkBtn" style="display: none;" onclick="disconnectOk()">Отключить</button>
            </div>
        </div>
        <div id="okStatus" class="channel-status" style="margin-top: 14px; font-size: 14px;"></div>

        <!-- Настройки публикации -->
        <div id="okSettingsBlock" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
            <h3 style="margin-bottom: 12px;">Настройки публикации</h3>
            <p style="color: #666; margin-bottom: 16px; font-size: 13px;">Настройки публикации контента в ОК: расписание, лимиты, дни недели.</p>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <!-- Schedule Time -->
                <div>
                    <label for="okScheduleTime">Schedule Time (HH:MM)</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <select id="okScheduleHour" style="width: 80px; margin-bottom: 0;" onchange="updateOkScheduleTime()">
                            <option value="00">00</option><option value="01">01</option><option value="02">02</option><option value="03">03</option>
                            <option value="04">04</option><option value="05">05</option><option value="06">06</option><option value="07">07</option>
                            <option value="08">08</option><option value="09">09</option><option value="10">10</option><option value="11">11</option>
                            <option value="12">12</option><option value="13">13</option><option value="14">14</option><option value="15">15</option>
                            <option value="16">16</option><option value="17">17</option><option value="18">18</option><option value="19">19</option>
                            <option value="20">20</option><option value="21">21</option><option value="22">22</option><option value="23">23</option>
                        </select>
                        <span style="font-size: 18px; font-weight: 600;">:</span>
                        <input type="text" id="okScheduleMinute" placeholder="00" style="width: 70px; margin-bottom: 0; text-align: center;" maxlength="2" onchange="validateOkMinutes()" oninput="validateOkMinutes()" />
                        <input type="hidden" id="okScheduleTime" />
                    </div>
                </div>
                
                <!-- Schedule TZ -->
                <div>
                    <label for="okScheduleTz">Schedule TZ</label>
                    <select id="okScheduleTz" onchange="updateOkScheduleTz()">
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
                    <label for="okDailyLimit">Daily Limit</label>
                    <input type="number" id="okDailyLimit" min="1" placeholder="5" />
                </div>
                
                <!-- Publish Interval -->
                <div>
                    <label for="okPublishInterval">Периодичность публикаций</label>
                    <select id="okPublishInterval">
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
                    <label><input type="checkbox" value="1" id="okWeekday1" checked> Пн</label>
                    <label><input type="checkbox" value="2" id="okWeekday2" checked> Вт</label>
                    <label><input type="checkbox" value="3" id="okWeekday3" checked> Ср</label>
                    <label><input type="checkbox" value="4" id="okWeekday4" checked> Чт</label>
                    <label><input type="checkbox" value="5" id="okWeekday5" checked> Пт</label>
                    <label><input type="checkbox" value="6" id="okWeekday6"> Сб</label>
                    <label><input type="checkbox" value="0" id="okWeekday0"> Вс</label>
                </div>
                <label style="cursor: pointer; white-space: nowrap;">
                    <input type="checkbox" id="okRandomPublish" style="margin-right: 4px;">Рандом
                </label>
            </div>
            
            <!-- Premoderation -->
            <div style="margin-bottom: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" id="okPremoderation" checked />
                    <span>Включить премодерацию</span>
                </label>
                <p style="color: #666; font-size: 12px; margin-top: 4px;">Если включено — контент будет отправляться в Telegram-бот на согласование перед публикацией.</p>
            </div>
            
            <!-- OK-specific: Post Type -->
            <div style="margin-bottom: 12px;">
                <label for="okPostType">Тип поста по умолчанию</label>
                <select id="okPostType">
                    <option value="post">Пост</option>
                    <option value="video">Видео</option>
                    <option value="album">Фотоальбом</option>
                </select>
                <p style="color: #666; font-size: 12px; margin-top: 4px;">
                    <strong>Пост</strong> — обычная запись на стене/в группе.<br>
                    <strong>Видео</strong> — загрузка видео в раздел Видео.<br>
                    <strong>Фотоальбом</strong> — публикация фотографий в альбоме.
                </p>
            </div>
            
            <!-- OK-specific: Age Restrict -->
            <div style="margin-bottom: 12px;">
                <label for="okAgeRestrict">Возрастное ограничение</label>
                <select id="okAgeRestrict">
                    <option value="0+">0+ (для всех)</option>
                    <option value="6+">6+ (для детей от 6 лет)</option>
                    <option value="12+">12+ (для детей от 12 лет)</option>
                    <option value="16+">16+ (для подростков от 16 лет)</option>
                    <option value="18+">18+ (для взрослых)</option>
                </select>
                <p style="color: #666; font-size: 12px; margin-top: 4px;">
                    Согласно требованиям ОК, контент должен иметь возрастную маркировку.
                </p>
            </div>
            
            <button class="btn btn-success" onclick="saveOkSettings()">Сохранить настройки</button>
            <div id="okSettingsStatus" style="margin-top: 10px; font-size: 13px;"></div>
        </div>
    </div>
</div>
```

---

## 2. Обновить `public/js/channels.js`

### 2.1. Добавить функции для OK

| Функция | Описание |
|---------|----------|
| `loadOkStatus()` | Загрузка текущих настроек OK через API |
| `saveOkKeys()` | Сохранение App ID, API Key, Secret Key |
| `disconnectOk()` | Отключение канала OK |
| `saveOkSettings()` | Сохранение настроек публикации |
| `updateOkScheduleTime()` | Обновление поля времени (аналог `updateScheduleTime`) |
| `validateOkMinutes()` | Валидация минут (аналог `validateMinutes`) |
| `updateOkScheduleTz()` | Обновление часового пояса |

### 2.2. Реализация функций

Вставить после функций VK (после `saveVkSettings`):

```javascript
// === Odnoklassniki (OK.ru) ===

function updateOkScheduleTime() {
    const hour = document.getElementById('okScheduleHour')?.value || '00';
    const minute = document.getElementById('okScheduleMinute')?.value || '00';
    const timeField = document.getElementById('okScheduleTime');
    if (timeField) {
        timeField.value = `${hour}:${minute.padStart(2, '0')}`;
    }
}

function validateOkMinutes() {
    const minuteInput = document.getElementById('okScheduleMinute');
    if (!minuteInput) return;
    let val = minuteInput.value.replace(/[^0-9]/g, '');
    if (val.length > 2) val = val.slice(0, 2);
    if (val !== '' && parseInt(val, 10) > 59) val = '59';
    minuteInput.value = val;
    updateOkScheduleTime();
}

function updateOkScheduleTz() {
    return;
}

function setOkScheduleTimeInputs(timeValue) {
    if (!timeValue) return;
    const parts = timeValue.split(':');
    if (parts.length < 2) return;
    const hourSelect = document.getElementById('okScheduleHour');
    const minuteInput = document.getElementById('okScheduleMinute');
    if (hourSelect) hourSelect.value = parts[0].padStart(2, '0');
    if (minuteInput) minuteInput.value = parts[1].padStart(2, '0');
    updateOkScheduleTime();
}

async function loadOkStatus() {
    const chatId = getChatId();
    if (!chatId) return;
    try {
        const res = await fetch(`${API_MANAGE}/channels/ok?chat_id=${encodeURIComponent(chatId)}`);
        const data = await res.json();
        const statusEl = document.getElementById('okStatus');
        const disconnectBtn = document.getElementById('disconnectOkBtn');
        const settingsBlock = document.getElementById('okSettingsBlock');
        if (!statusEl) return;

        if (data.connected) {
            statusEl.innerHTML = '<span style="color: #0a0;">✅ OK подключён</span>';
            if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
            if (settingsBlock) settingsBlock.style.display = 'block';
            
            // Заполняем поля формы сохранёнными значениями
            const cfg = data.config || {};
            if (cfg.group_id) document.getElementById('okGroupId').value = cfg.group_id;
            if (cfg.app_id) document.getElementById('okAppId').value = cfg.app_id;
            if (cfg.api_key) document.getElementById('okApiKey').value = cfg.api_key;
            if (cfg.secret_key) document.getElementById('okSecretKey').value = cfg.secret_key;
            
            // Заполняем настройки публикации
            const s = data.settings || {};
            if (s.schedule_time) {
                document.getElementById('okScheduleTime').value = s.schedule_time;
                setOkScheduleTimeInputs(s.schedule_time);
            }
            const tzSelect = document.getElementById('okScheduleTz');
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
            if (s.daily_limit) document.getElementById('okDailyLimit').value = s.daily_limit;
            const intervalEl = document.getElementById('okPublishInterval');
            if (intervalEl) intervalEl.value = String(s.publish_interval_hours ?? 24);
            const randomEl = document.getElementById('okRandomPublish');
            if (randomEl) randomEl.checked = !!s.random_publish;
            const premoderEl = document.getElementById('okPremoderation');
            if (premoderEl) premoderEl.checked = s.premoderation_enabled !== false;
            const postTypeEl = document.getElementById('okPostType');
            if (postTypeEl) postTypeEl.value = s.post_type || 'post';
            const ageRestrictEl = document.getElementById('okAgeRestrict');
            if (ageRestrictEl) ageRestrictEl.value = s.age_restrict || '0+';
            
            // Дни недели
            const weekdays = Array.isArray(s.allowed_weekdays) ? s.allowed_weekdays : [1, 2, 3, 4, 5];
            for (let d = 0; d <= 6; d++) {
                const cb = document.getElementById('okWeekday' + d);
                if (cb) cb.checked = weekdays.includes(d);
            }
        } else {
            statusEl.textContent = '';
            if (disconnectBtn) disconnectBtn.style.display = 'none';
            if (settingsBlock) settingsBlock.style.display = 'none';
        }
    } catch (e) {
        console.error('loadOkStatus', e);
    }
}

async function saveOkKeys() {
    const chatId = getChatId();
    if (!chatId) return;
    const groupId = document.getElementById('okGroupId')?.value?.trim();
    const appId = document.getElementById('okAppId')?.value?.trim();
    const apiKey = document.getElementById('okApiKey')?.value?.trim();
    const secretKey = document.getElementById('okSecretKey')?.value?.trim();
    
    if (!groupId || !appId || !apiKey || !secretKey) {
        showToast('Заполните все поля: Group ID, App ID, API Key, Secret Key', 'error');
        return;
    }
    
    try {
        const res = await fetch(`${API_MANAGE}/channels/ok`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                group_id: groupId,
                app_id: appId,
                api_key: apiKey,
                secret_key: secretKey
            })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('OK подключён', 'success');
            await loadOkStatus();
        } else {
            showToast(data.error || 'Ошибка подключения', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

async function disconnectOk() {
    const chatId = getChatId();
    if (!chatId || !confirm('Отключить OK для этого окружения?')) return;
    try {
        const res = await fetch(`${API_MANAGE}/channels/ok?chat_id=${encodeURIComponent(chatId)}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('OK отключён', 'success');
            await loadOkStatus();
        } else {
            showToast('Ошибка отключения', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

async function saveOkSettings() {
    const chatId = getChatId();
    if (!chatId) return;
    updateOkScheduleTime();
    
    try {
        const res = await fetch(`${API_MANAGE}/channels/ok/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                schedule_time: (document.getElementById('okScheduleTime')?.value || '').trim(),
                schedule_tz: (document.getElementById('okScheduleTz')?.value || '').trim(),
                daily_limit: (document.getElementById('okDailyLimit')?.value || '').trim(),
                publish_interval_hours: parseFloat(document.getElementById('okPublishInterval')?.value || '24'),
                random_publish: !!document.getElementById('okRandomPublish')?.checked,
                premoderation_enabled: !!document.getElementById('okPremoderation')?.checked,
                post_type: (document.getElementById('okPostType')?.value || 'post').trim(),
                age_restrict: (document.getElementById('okAgeRestrict')?.value || '0+').trim(),
                allowed_weekdays: [0,1,2,3,4,5,6].filter(d => document.getElementById('okWeekday' + d)?.checked)
            })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('Настройки OK сохранены', 'success');
            await loadOkStatus();
        } else {
            showToast(data.error || 'Ошибка сохранения', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}
```

### 2.3. Обновить `onLoginSuccess()`

Добавить вызов `await loadOkStatus();`:

```javascript
async function onLoginSuccess() {
    await loadTelegramStatus();
    await loadEmailStatus();
    await loadContentSettings();
    await loadPinterestConfig();
    await loadVkStatus();
    await loadOkStatus();  // ← Добавить эту строку
}
```

---

## 3. Обновить `manage/routes.js`

### 3.1. Добавить API endpoints

| Endpoint | Method | Описание |
|----------|--------|----------|
| `GET /api/manage/channels/ok` | GET | Получить настройки OK |
| `POST /api/manage/channels/ok` | POST | Сохранить ключи API |
| `DELETE /api/manage/channels/ok` | DELETE | Отключить OK |
| `POST /api/manage/channels/ok/settings` | POST | Сохранить настройки публикации |

### 3.2. Реализация endpoints

Вставить после endpoints для VK:

```javascript
// === Odnoklassniki (OK.ru) Channel ===

router.get('/channels/ok', async (req, res) => {
    try {
        const chatId = req.query.chat_id;
        if (!chatId) {
            return res.status(400).json({ error: 'chat_id is required' });
        }
        
        const okConfig = store.getOkConfig(chatId);
        const okSettings = store.getOkSettings(chatId);
        
        res.json({
            connected: !!okConfig?.group_id,
            config: okConfig || {},
            settings: okSettings || {}
        });
    } catch (e) {
        console.error('GET /api/manage/channels/ok', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/channels/ok', async (req, res) => {
    try {
        const { chat_id, group_id, app_id, api_key, secret_key } = req.body;
        if (!chat_id || !group_id || !app_id || !api_key || !secret_key) {
            return res.status(400).json({ error: 'chat_id, group_id, app_id, api_key, and secret_key are required' });
        }
        
        store.setOkConfig(chat_id, {
            group_id,
            app_id,
            api_key,
            secret_key,
            is_active: true,
            connected_at: new Date().toISOString()
        });
        
        res.json({ success: true });
    } catch (e) {
        console.error('POST /api/manage/channels/ok', e);
        res.status(500).json({ error: e.message });
    }
});

router.delete('/channels/ok', async (req, res) => {
    try {
        const chatId = req.query.chat_id;
        if (!chatId) {
            return res.status(400).json({ error: 'chat_id is required' });
        }
        
        store.setOkConfig(chatId, {});
        store.setOkSettings(chatId, {});
        
        res.json({ success: true });
    } catch (e) {
        console.error('DELETE /api/manage/channels/ok', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/channels/ok/settings', async (req, res) => {
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
            age_restrict,
            allowed_weekdays
        } = req.body;
        
        if (!chat_id) {
            return res.status(400).json({ error: 'chat_id is required' });
        }
        
        store.setOkSettings(chat_id, {
            schedule_time,
            schedule_tz,
            daily_limit,
            publish_interval_hours,
            random_publish,
            premoderation_enabled,
            post_type,
            age_restrict,
            allowed_weekdays
        });
        
        res.json({ success: true });
    } catch (e) {
        console.error('POST /api/manage/channels/ok/settings', e);
        res.status(500).json({ error: e.message });
    }
});
```

---

## 4. Обновить `manage/store.js`

### 4.1. Добавить функции состояния OK

Вставить после функций VK (после `setVkSettings`):

```javascript
// === OK (Odnoklassniki) Config ===

function getOkConfig(chatId) {
    const data = statesCache[chatId];
    return data?.okConfig || null;
}

function setOkConfig(chatId, patch = {}) {
    if (!statesCache[chatId]) statesCache[chatId] = {};
    const current = statesCache[chatId].okConfig || {};
    const next = { ...current };

    if (patch.group_id !== undefined) next.group_id = String(patch.group_id || '').trim() || null;
    if (patch.app_id !== undefined) next.app_id = String(patch.app_id || '').trim() || null;
    if (patch.api_key !== undefined) next.api_key = patch.api_key || null;
    if (patch.secret_key !== undefined) next.secret_key = patch.secret_key || null;
    if (patch.is_active !== undefined) next.is_active = !!patch.is_active;
    if (patch.connected_at !== undefined) next.connected_at = patch.connected_at;

    statesCache[chatId].okConfig = next;
    return persist(chatId);
}

// === OK Settings ===

function getOkSettings(chatId) {
    const data = statesCache[chatId];
    return data?.okSettings || null;
}

function setOkSettings(chatId, patch = {}) {
    if (!statesCache[chatId]) statesCache[chatId] = {};
    const current = statesCache[chatId].okSettings || {};
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
        const allowedTypes = ['post', 'video', 'album'];
        const postType = String(patch.post_type || '').trim().toLowerCase();
        if (!allowedTypes.includes(postType)) {
            throw new Error('post_type must be one of: ' + allowedTypes.join(', '));
        }
        next.post_type = postType;
    }
    
    if (patch.age_restrict !== undefined) {
        const allowedAges = ['0+', '6+', '12+', '16+', '18+'];
        const ageRestrict = String(patch.age_restrict || '').trim();
        if (!allowedAges.includes(ageRestrict)) {
            throw new Error('age_restrict must be one of: ' + allowedAges.join(', '));
        }
        next.age_restrict = ageRestrict;
    }

    statesCache[chatId].okSettings = next;
    return persist(chatId);
}
```

---

## 5. Интеграция с базой данных

### 5.1. Таблица `content_channels`

При сохранении настроек OK создавать/обновлять запись в `content_channels`:

```sql
-- Пример записи для OK
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
    api_secret,
    is_active, 
    auto_publish, 
    schedule_timezone,
    daily_limit, 
    posting_hours, 
    channel_metadata
) VALUES (
    '128247430',           -- user_id (chat_id)
    'ok',                  -- channel_name
    'social',              -- channel_type
    '123456789',           -- channel_id (group_id)
    'Мой бизнес в ОК',     -- channel_name_display
    'my_business_ok',      -- channel_username
    'oauth',               -- auth_type
    'encrypted_access_token', -- access_token (шифровать!)
    'encrypted_api_key',   -- api_key (шифровать!)
    'encrypted_secret_key', -- api_secret (шифровать!)
    true,                  -- is_active
    false,                 -- auto_publish
    'Europe/Moscow',       -- schedule_timezone
    5,                     -- daily_limit
    '{"start": "09:00", "end": "21:00", "days": [1,2,3,4,5]}', -- posting_hours
    '{"post_type": "post", "age_restrict": "0+", "enable_comments": true}'::jsonb -- channel_metadata
)
ON CONFLICT (user_id, channel_name, channel_id) 
DO UPDATE SET
    channel_name_display = EXCLUDED.channel_name_display,
    channel_username = EXCLUDED.channel_username,
    access_token = EXCLUDED.access_token,
    api_key = EXCLUDED.api_key,
    api_secret = EXCLUDED.api_secret,
    is_active = EXCLUDED.is_active,
    auto_publish = EXCLUDED.auto_publish,
    schedule_timezone = EXCLUDED.schedule_timezone,
    daily_limit = EXCLUDED.daily_limit,
    posting_hours = EXCLUDED.posting_hours,
    channel_metadata = EXCLUDED.channel_metadata,
    updated_at = NOW();
```

### 5.2. Таблица `content_queue` → `channel_config`

Для каждой публикации OK в `channel_config` сохраняется:

```json
{
  "group_id": "123456789",
  "post_type": "post",
  "age_restrict": "0+",
  "attach": [],
  "friend_only": false,
  "enable_comments": true,
  "location": {
    "lat": 55.7558,
    "lon": 37.6173
  }
}
```

---

## 6. Критерии приёмки

- [ ] Форма OK отображается при переключении на вкладку "Одноклассники"
- [ ] Поля Group ID, App ID, API Key, Secret Key сохраняются и загружаются
- [ ] Настройки публикации (время, TZ, лимиты, дни недели) работают аналогично Telegram/VK
- [ ] Чекбокс "Рандом" активирует случайный интервал до следующей публикации
- [ ] Выпадающий список "Тип поста" содержит: post, video, album
- [ ] Выпадающий список "Возрастное ограничение" содержит: 0+, 6+, 12+, 16+, 18+
- [ ] Кнопка "Сохранить настройки" отправляет данные на сервер
- [ ] Статус подключения отображается после загрузки
- [ ] Кнопка "Отключить" удаляет настройки OK
- [ ] Валидация времени (HH:MM) работает корректно
- [ ] Валидация минут (00-59) работает корректно
- [ ] Дни недели сохраняются в массиве (0-6)
- [ ] Часовой пояс сохраняется и загружается

---

## 7. Ссылки на реализацию

### Файлы для редактирования

| Файл | Строки | Описание |
|------|--------|----------|
| `public/channels.html` | ~290-300 | Заменить заглушку OK на полную форму |
| `public/js/channels.js` | ~650-750 | Добавить функции OK (после VK) |
| `manage/routes.js` | ~650-750 | Добавить API endpoints (после VK) |
| `manage/store.js` | ~700-800 | Добавить функции состояния (после VK) |

### Референсы

- **Telegram:** `public/channels.html` строки 60-180, `public/js/channels.js` функции `loadTelegramStatus`, `saveTelegramToken`
- **Pinterest:** `public/channels.html` строки 182-260, `public/js/channels.js` функции `loadPinterestConfig`, `savePinterestConfig`
- **VK:** См. документ `VK-form-dev-task.md`
- **Store:** `manage/store.js` функции `setContentSettings` (строки 463-522), `setVkSettings`
- **Routes:** `manage/routes.js` endpoints `/api/manage/channels/vk`

---

## 8. Дополнительные задачи (опционально)

### 8.1. Шифрование ключей API

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

### 8.2. Тестирование OK API

Создать файл `test/ok-api.test.js` для проверки:
- Подключения к OK API
- Публикации поста
- Публикации видео
- Публикации фотоальбома

---

## 9. Примечания

### OK API Documentation

1. **Официальная документация:** https://apiok.ru/dev/
2. **Получение ключей:** https://apiok.ru/dev/applications

### Получение Group ID

Group ID можно узнать через метод `groups.getInfo` или из URL группы:
- URL: `https://ok.ru/group/123456789`
- Group ID: `123456789`

### Методы API для публикации

| Тип контента | Метод API |
|--------------|-----------|
| Пост | `mediatopic.post` |
| Видео | `video.save` + `mediatopic.post` |
| Фотоальбом | `photosv2.getUploadUrl` + `mediatopic.post` |

### Возрастные ограничения

OK требует указывать возрастную маркировку для всего контента:
- `0+` — для всех
- `6+` — для детей от 6 лет
- `12+` — для детей от 12 лет
- `16+` — для подростков от 16 лет
- `18+` — для взрослых

### OAuth 2.0 авторизация

Для работы с OK API требуется OAuth 2.0 токен:
```
https://www.odnoklassniki.ru/oauth/authorize?
  client_id={APP_ID}&
  scope=VALUABLE_ACCESS;GROUP_CONTENT;PHOTO_CONTENT;VIDEO_CONTENT&
  response_type=token&
  redirect_uri={REDIRECT_URI}
```
