/**
 * Billing API routes — token balance, transactions, packages
 */
const express = require('express');
const router = express.Router();
const TokenBilling = require('../manage/tokenBilling');

// GET /api/billing/balance?chat_id=123
router.get('/balance', async (req, res) => {
    const chatId = req.query.chat_id;
    if (!chatId) return res.status(400).json({ error: 'chat_id is required' });
    try {
        const result = await TokenBilling.getBalance(chatId);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/billing/transactions?chat_id=123&limit=50
router.get('/transactions', async (req, res) => {
    const chatId = req.query.chat_id;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    if (!chatId) return res.status(400).json({ error: 'chat_id is required' });
    try {
        const rows = await TokenBilling.getTransactions(chatId, limit);
        res.json({ items: rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/billing/packages
router.get('/packages', async (req, res) => {
    try {
        const packages = await TokenBilling.getAvailablePackages();
        res.json({ packages });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/billing/purchase { chat_id, package_id }
router.post('/purchase', async (req, res) => {
    const { chat_id: chatId, package_id: packageId } = req.body;
    if (!chatId || !packageId) return res.status(400).json({ error: 'chat_id и package_id обязательны' });
    try {
        const result = await TokenBilling.purchasePackage(chatId, packageId);
        res.json(result);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
