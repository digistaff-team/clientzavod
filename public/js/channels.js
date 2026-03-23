const API_MANAGE = `${window.location.origin}/api/manage`;

async function onLoginSuccess() {
    await loadTelegramStatus();
    await loadEmailStatus();
    await loadContentSettings();
}

// Специальная инициализация для страницы каналов
// Позволяет подключить бота без авторизации
async function initChannelsAuth() {
    const savedChatId = localStorage.getItem('chatId');
    const savedTelegramId = localStorage.getItem('telegramId');
    const authSection = document.getElementById('authSection');
    const mainContent = document.getElementById('mainContent');
    const logoutBtn = document.getElementById('logoutButton');
    const chatIdInput = document.getElementById('chatIdInput');

    if (savedChatId && savedTelegramId) {
        // Уже авторизован - показываем контент
        currentChatId = savedChatId;
        if (chatIdInput) chatIdInput.value = savedTelegramId;
        if (logoutBtn) logoutBtn.style.display = 'block';
        if (authSection) authSection.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';
        await onLoginSuccess();
    } else {
        // Не авторизован - показываем форму для ввода Telegram ID
        if (authSection) authSection.style.display = 'block';
        if (mainContent) mainContent.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
    }
}

// Вход для страницы каналов - создаёт временную сессию
async function loginForChannels() {
    const chatIdInput = document.getElementById('chatIdInput');
    if (!chatIdInput) return;
    const telegramId = chatIdInput.value.trim();
    
    if (!telegramId) {
        showToast('Введите ваш Telegram ID', 'error');
        return;
    }
    
    if (!/^\d+$/.test(telegramId)) {
        showToast('Telegram ID должен быть числом (например: 123456789)', 'error');
        return;
    }

    setApiStatus('Создание сессии...', 'info');

    try {
        // Создаём новую сессию с chat_id = telegram_id
        const response = await fetch(`${API_URL}/session/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: telegramId })
        });

        if (response.ok) {
            currentChatId = telegramId;
            localStorage.setItem('chatId', telegramId);
            localStorage.setItem('telegramId', telegramId);
            
            setApiStatus('', '');
            
            document.getElementById('authSection').style.display = 'none';
            document.getElementById('mainContent').style.display = 'block';
            const logoutBtn = document.getElementById('logoutButton');
            if (logoutBtn) logoutBtn.style.display = 'block';
            
            showToast('Сессия создана. Теперь подключите бота.', 'success');
            await onLoginSuccess();
        } else {
            const errorData = await response.json().catch(() => ({}));
            showToast(errorData.error || 'Ошибка создания сессии', 'error');
        }
    } catch (error) {
        showToast('Ошибка подключения к серверу', 'error');
    }
}

async function loadTelegramStatus() {
    const chatId = getChatId();
    if (!chatId) return;
    try {
        const res = await fetch(`${API_MANAGE}/telegram/status?chat_id=${encodeURIComponent(chatId)}`);
        const data = await res.json();
        const statusEl = document.getElementById('telegramStatus');
        const verifyBlock = document.getElementById('telegramVerifyBlock');
        const disconnectBtn = document.getElementById('disconnectTelegramBtn');
        const tokenInput = document.getElementById('telegramBotToken');
        if (!statusEl) return;

        if (data.verified) {
            statusEl.innerHTML = '<span style="color: #0a0;">✅ Подтверждён как ' + (data.username || 'пользователь') + '. Можно управлять окружением из Telegram (команды выполняются в вашем контейнере).</span>';
            verifyBlock.style.display = 'none';
            if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
            // Показываем полный токен
            if (tokenInput && data.token) tokenInput.value = data.token;
        } else if (data.hasToken) {
            statusEl.textContent = 'Токен сохранён. Отправьте боту в Telegram любое сообщение — он пришлёт код. Введите код ниже.';
            verifyBlock.style.display = 'block';
            if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
            // Показываем полный токен
            if (tokenInput && data.token) tokenInput.value = data.token;
        } else {
            statusEl.textContent = '';
            verifyBlock.style.display = 'none';
            if (disconnectBtn) disconnectBtn.style.display = 'none';
            if (tokenInput) tokenInput.value = '';
        }
    } catch (e) {
        console.error('loadTelegramStatus', e);
    }
}

async function saveTelegramToken() {
    const chatId = getChatId();
    if (!chatId) return;
    const input = document.getElementById('telegramBotToken');
    if (!input) return;
    const token = (input.value || '').trim();
    if (!token) {
        showToast('Введите токен бота', 'error');
        return;
    }
    try {
        const res = await fetch(`${API_MANAGE}/telegram`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, token })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('Токен сохранён, бот запущен', 'success');
            // НЕ очищаем поле - перезагружаем статус чтобы сохранить токен
            await loadTelegramStatus();
        } else {
            showToast(data.error || 'Ошибка сохранения', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

async function verifyTelegramCode() {
    const chatId = getChatId();
    if (!chatId) return;
    const input = document.getElementById('telegramVerifyCode');
    if (!input) return;
    const code = (input.value || '').trim();
    if (!code) {
        showToast('Введите код из Telegram', 'error');
        return;
    }
    try {
        const res = await fetch(`${API_MANAGE}/telegram/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, code })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('Подтверждено', 'success');
            input.value = '';
            await loadTelegramStatus();
        } else {
            showToast(data.error || 'Неверный или просроченный код', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

async function disconnectTelegram() {
    const chatId = getChatId();
    if (!chatId || !confirm('Отключить Telegram-бота для этого окружения?')) return;
    try {
        const res = await fetch(`${API_MANAGE}/telegram?chat_id=${encodeURIComponent(chatId)}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Бот отключён', 'success');
            await loadTelegramStatus();
        } else {
            showToast('Ошибка отключения', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

async function loadEmailStatus() {
    const chatId = getChatId();
    if (!chatId) return;
    try {
        const res = await fetch(`${API_MANAGE}/email/status?chat_id=${encodeURIComponent(chatId)}`);
        const data = await res.json();
        const statusEl = document.getElementById('emailStatus');
        const disconnectBtn = document.getElementById('disconnectEmailBtn');
        if (!statusEl) return;

        if (data.hasEmail) {
            statusEl.innerHTML = `<span style="color: #0a0;">✅ Активен: IMAP ${data.config.imapHost} / SMTP ${data.config.smtpHost}. Обработано: ${data.processedCount||0}. Интервал: ${data.pollIntervalMinutes||5} мин. Последний опрос: ${data.lastPollAgoMinutes ? data.lastPollAgoMinutes + ' мин назад' : 'не было'}.</span>`;
            const pollSettings = document.getElementById('pollSettings');
            if (pollSettings) pollSettings.style.display = 'block';
            const select = document.getElementById('emailPollInterval');
            if (select) select.value = data.pollIntervalMinutes || 5;
            if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
            
            // Заполняем поля формы сохранёнными значениями
            if (data.config.imapHost) {
                const imapHostInput = document.getElementById('emailImapHost');
                if (imapHostInput) imapHostInput.value = data.config.imapHost;
            }
            if (data.config.imapPort) {
                const imapPortInput = document.getElementById('emailImapPort');
                if (imapPortInput) imapPortInput.value = data.config.imapPort;
            }
            if (data.config.imapUser) {
                const imapUserInput = document.getElementById('emailImapUser');
                if (imapUserInput) imapUserInput.value = data.config.imapUser;
            }
            if (data.config.imapPass) {
                const imapPassInput = document.getElementById('emailImapPass');
                if (imapPassInput) imapPassInput.value = data.config.imapPass;
            }
            if (data.config.smtpHost) {
                const smtpHostInput = document.getElementById('emailSmtpHost');
                if (smtpHostInput) smtpHostInput.value = data.config.smtpHost;
            }
            if (data.config.smtpPort) {
                const smtpPortInput = document.getElementById('emailSmtpPort');
                if (smtpPortInput) smtpPortInput.value = data.config.smtpPort;
            }
            if (data.config.smtpUser) {
                const smtpUserInput = document.getElementById('emailSmtpUser');
                if (smtpUserInput) smtpUserInput.value = data.config.smtpUser;
            }
            if (data.config.smtpPass) {
                const smtpPassInput = document.getElementById('emailSmtpPass');
                if (smtpPassInput) smtpPassInput.value = data.config.smtpPass;
            }
        } else {
            statusEl.textContent = '';
            if (disconnectBtn) disconnectBtn.style.display = 'none';
        }
    } catch (e) {
        console.error('loadEmailStatus', e);
    }
}

async function saveEmailConfig() {
    const chatId = getChatId();
    if (!chatId) return;

    const imapHost = document.getElementById('emailImapHost')?.value?.trim();
    const imapPort = document.getElementById('emailImapPort')?.value?.trim();
    const imapUser = document.getElementById('emailImapUser')?.value?.trim();
    const imapPass = document.getElementById('emailImapPass')?.value?.trim();
    const smtpHost = document.getElementById('emailSmtpHost')?.value?.trim();
    const smtpPort = document.getElementById('emailSmtpPort')?.value?.trim();
    const smtpUser = document.getElementById('emailSmtpUser')?.value?.trim();
    const smtpPass = document.getElementById('emailSmtpPass')?.value?.trim();
    const pollIntervalMinutes = document.getElementById('emailPollInterval')?.value?.trim() || '5';

    if (!imapHost || !imapUser || !imapPass || !smtpHost || !smtpUser || !smtpPass) {
        showToast('Заполните все обязательные поля IMAP и SMTP', 'error');
        return;
    }

    try {
        const res = await fetch(`${API_MANAGE}/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                imap_host: imapHost,
                imap_port: imapPort,
                imap_user: imapUser,
                imap_pass: imapPass,
                smtp_host: smtpHost,
                smtp_port: smtpPort,
                smtp_user: smtpUser,
                smtp_pass: smtpPass,
                poll_interval_minutes: pollIntervalMinutes
            })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('Email настройки сохранены и активированы. Установлено правило проверки почты через скрипт processor.js. Cron запущен.', 'success');
            // НЕ очищаем поля паролей - перезагружаем статус чтобы сохранить значения
            await loadEmailStatus();
        } else {
            showToast(data.error || 'Ошибка сохранения', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

async function updateEmailPoll() {
    const chatId = getChatId();
    if (!chatId) return;
    const select = document.getElementById('emailPollInterval');
    if (!select) return;
    const minutes = parseInt(select.value);
    try {
        const res = await fetch(`${API_MANAGE}/email/poll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, minutes })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('Интервал обновлён', 'success');
            await loadEmailStatus();
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

async function disconnectEmail() {
    const chatId = getChatId();
    if (!chatId || !confirm('Отключить обработку Email для этого окружения?')) return;
    try {
        const res = await fetch(`${API_MANAGE}/email?chat_id=${encodeURIComponent(chatId)}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Email отключён', 'success');
            await loadEmailStatus();
        } else {
            showToast('Ошибка отключения', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}

// === Контент-настройки ===

function updateScheduleTime() {
    const hour = document.getElementById('contentScheduleHour')?.value || '00';
    const minute = document.getElementById('contentScheduleMinute')?.value || '00';
    const timeField = document.getElementById('contentScheduleTime');
    if (timeField) {
        timeField.value = `${hour}:${minute.padStart(2, '0')}`;
    }
}

function validateMinutes() {
    const minuteInput = document.getElementById('contentScheduleMinute');
    if (!minuteInput) return;
    let val = minuteInput.value.replace(/[^0-9]/g, '');
    if (val.length > 2) val = val.slice(0, 2);
    if (val !== '' && parseInt(val, 10) > 59) val = '59';
    minuteInput.value = val;
    updateScheduleTime();
}

function setScheduleTimeInputs(timeValue) {
    if (!timeValue) return;
    const parts = timeValue.split(':');
    if (parts.length < 2) return;
    const hourSelect = document.getElementById('contentScheduleHour');
    const minuteInput = document.getElementById('contentScheduleMinute');
    if (hourSelect) hourSelect.value = parts[0].padStart(2, '0');
    if (minuteInput) minuteInput.value = parts[1].padStart(2, '0');
    updateScheduleTime();
}

function updateScheduleTz() {
    return;
}

function setScheduleTzInput(tzValue) {
    const tzSelect = document.getElementById('contentScheduleTz');
    if (!tzSelect || !tzValue) return;
    const optionExists = Array.from(tzSelect.options).some((opt) => opt.value === tzValue);
    if (optionExists) {
        tzSelect.value = tzValue;
        return;
    }
    const newOption = document.createElement('option');
    newOption.value = tzValue;
    newOption.text = `${tzValue} (custom)`;
    newOption.selected = true;
    tzSelect.insertBefore(newOption, tzSelect.firstChild);
}

async function loadContentSettings() {
    const chatId = getChatId();
    if (!chatId) return;
    try {
        const res = await fetch(`${API_MANAGE}/content/settings?chat_id=${encodeURIComponent(chatId)}`);
        const data = await res.json();
        const s = data.settings || {};
        const channelEl = document.getElementById('contentChannelId');
        const moderatorEl = document.getElementById('contentModeratorUserId');
        const timeEl = document.getElementById('contentScheduleTime');
        const limitEl = document.getElementById('contentDailyLimit');
        if (channelEl) channelEl.value = s.channelId || '';
        // По умолчанию подставляем chatId пользователя как Moderator User ID
        if (moderatorEl) moderatorEl.value = s.moderatorUserId || chatId;
        if (timeEl) timeEl.value = s.scheduleTime || '';
        if (s.scheduleTime) setScheduleTimeInputs(s.scheduleTime);
        setScheduleTzInput(s.scheduleTz || 'Europe/Moscow');
        if (limitEl) limitEl.value = s.dailyLimit || '';
    } catch (e) {
        console.error('loadContentSettings', e);
    }
}

async function saveContentSettings() {
    const chatId = getChatId();
    if (!chatId) return;
    updateScheduleTime();
    try {
        const res = await fetch(`${API_MANAGE}/content/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                channel_id: (document.getElementById('contentChannelId')?.value || '').trim(),
                moderator_user_id: (document.getElementById('contentModeratorUserId')?.value || '').trim(),
                schedule_time: (document.getElementById('contentScheduleTime')?.value || '').trim(),
                schedule_tz: (document.getElementById('contentScheduleTz')?.value || '').trim(),
                daily_limit: (document.getElementById('contentDailyLimit')?.value || '').trim()
            })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast('Контент-настройки сохранены', 'success');
            await loadContentSettings();
        } else {
            showToast(data.error || 'Ошибка сохранения', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}
