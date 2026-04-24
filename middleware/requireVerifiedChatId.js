const manageStore = require('../manage/store');

module.exports = function requireVerifiedChatId(getChatId) {
    return (req, res, next) => {
        const chatId = String(getChatId(req) || '');
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }
        const state = manageStore.getState(chatId);
        if (!state || !state.verifiedTelegramId) {
            return res.status(403).json({ error: 'Access denied. Authorize via Telegram bot @clientzavod_bot first.' });
        }
        next();
    };
};
