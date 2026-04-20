/**
 * Billing Routes - Token Balance & Payment Management
 *
 * Provides user and admin endpoints for managing token balances,
 * transaction history, and statistics. Integrates with TokenBilling service.
 */

const express = require('express');
const router = express.Router();
const TokenBilling = require('../manage/tokenBilling');

// ==================== ADMIN AUTH MIDDLEWARE ====================

/**
 * Verify admin authentication via ADMIN_PASSWORD
 * Supports both query param and Authorization header: Bearer <password>
 */
function requireAdminAuth(req, res, next) {
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        return res.status(500).json({ error: 'Admin password not configured' });
    }

    const authHeader = req.headers.authorization || '';
    const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const passwordFromQuery = req.query.admin_password;

    const providedPassword = tokenFromHeader || passwordFromQuery || '';

    if (providedPassword !== adminPassword) {
        return res.status(401).json({ error: 'Unauthorized: Invalid admin credentials' });
    }

    next();
}

// ==================== USER ENDPOINTS ====================

/**
 * GET /api/billing/balance
 * Get user's current balance and plan information
 */
router.get('/balance', async (req, res) => {
    try {
        const { telegram_id } = req.query;

        if (!telegram_id) {
            return res.status(400).json({ error: 'Missing required parameter: telegram_id' });
        }

        const balance = await TokenBilling.getBalance(telegram_id);

        res.json({
            telegram_id: parseInt(telegram_id),
            balance_tokens: balance.balance_tokens || 0,
            plan_id: balance.plan_id || 'free',
            monthly_included_tokens: balance.monthly_included_tokens || 0,
            next_reset_date: balance.next_reset_date || null,
            total_spent_lifetime: balance.total_spent_lifetime || 0,
            usage_this_month: balance.usage_this_month || 0
        });
    } catch (error) {
        console.error('[BILLING] GET /balance error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/billing/transactions
 * Get user's transaction history with pagination
 */
router.get('/transactions', async (req, res) => {
    try {
        const { telegram_id, limit = 50, offset = 0, type } = req.query;

        if (!telegram_id) {
            return res.status(400).json({ error: 'Missing required parameter: telegram_id' });
        }

        const parsedLimit = Math.min(parseInt(limit) || 50, 100); // Max 100 per request
        const parsedOffset = parseInt(offset) || 0;

        let transactions = await TokenBilling.getTransactions(telegram_id, parsedLimit + parsedOffset);

        // Filter by type if provided
        if (type === 'income') {
            transactions = transactions.filter(t => t.amount > 0);
        } else if (type === 'expense') {
            transactions = transactions.filter(t => t.amount < 0);
        }

        // Apply pagination
        const total = transactions.length;
        transactions = transactions.slice(parsedOffset, parsedOffset + parsedLimit);

        res.json({
            transactions: transactions.map(t => ({
                id: t.id,
                telegram_id: t.telegram_id,
                amount: t.amount,
                reason: t.reason,
                model: t.model || null,
                prompt_tokens: t.prompt_tokens || null,
                completion_tokens: t.completion_tokens || null,
                created_at: t.created_at
            })),
            total,
            limit: parsedLimit,
            offset: parsedOffset
        });
    } catch (error) {
        console.error('[BILLING] GET /transactions error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/billing/usage
 * Get token usage statistics for a date range
 */
router.get('/usage', async (req, res) => {
    try {
        const { telegram_id, period = '7d' } = req.query;

        if (!telegram_id) {
            return res.status(400).json({ error: 'Missing required parameter: telegram_id' });
        }

        if (!['7d', '30d', 'all'].includes(period)) {
            return res.status(400).json({ error: 'Invalid period: must be 7d, 30d, or all' });
        }

        // Calculate date range
        const endDate = new Date();
        let startDate = new Date();

        if (period === '7d') {
            startDate.setDate(endDate.getDate() - 7);
        } else if (period === '30d') {
            startDate.setDate(endDate.getDate() - 30);
        } else {
            startDate = new Date('2000-01-01'); // All time
        }

        const usage = await TokenBilling.getTokenUsage(telegram_id, startDate, endDate);
        const transactions = await TokenBilling.getTransactions(telegram_id, 1000);

        // Filter transactions for the period
        const periodTransactions = transactions.filter(t => {
            const txDate = new Date(t.created_at);
            return txDate >= startDate && txDate <= endDate;
        });

        // Build daily breakdown
        const dailyMap = new Map();
        periodTransactions.forEach(t => {
            const date = new Date(t.created_at).toISOString().split('T')[0];
            if (!dailyMap.has(date)) {
                dailyMap.set(date, { date, tokens_spent: 0, transaction_count: 0 });
            }
            if (t.amount < 0) {
                dailyMap.get(date).tokens_spent += Math.abs(t.amount);
                dailyMap.get(date).transaction_count += 1;
            }
        });

        const daily_breakdown = Array.from(dailyMap.values()).sort((a, b) =>
            new Date(a.date) - new Date(b.date)
        );

        // Build usage by type/model
        const typeMap = new Map();
        periodTransactions.forEach(t => {
            if (t.amount < 0) {
                const key = t.model || 'unknown';
                if (!typeMap.has(key)) {
                    typeMap.set(key, { type: key, count: 0, tokens_spent: 0 });
                }
                typeMap.get(key).count += 1;
                typeMap.get(key).tokens_spent += Math.abs(t.amount);
            }
        });

        const usage_by_type = Array.from(typeMap.values())
            .sort((a, b) => b.tokens_spent - a.tokens_spent);

        res.json({
            telegram_id: parseInt(telegram_id),
            period,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
            total_spent: usage.total_spent || 0,
            transaction_count: usage.transaction_count || 0,
            daily_breakdown,
            usage_by_type
        });
    } catch (error) {
        console.error('[BILLING] GET /usage error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/billing/packages
 * Get list of available token packages for purchase
 */
router.get('/packages', async (req, res) => {
    try {
        const packages = await TokenBilling.getAvailablePackages();

        res.json({
            packages: packages.map(p => ({
                package_id: p.package_id,
                name: p.name,
                tokens_amount: p.tokens_amount,
                price_rub: parseFloat(p.price_rub),
                is_active: p.is_active
            }))
        });
    } catch (error) {
        console.error('[BILLING] GET /packages error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/billing/purchase
 * Create a purchase of token package
 */
router.post('/purchase', async (req, res) => {
    try {
        const { telegram_id, package_id } = req.body;

        if (!telegram_id || !package_id) {
            return res.status(400).json({ error: 'Missing required fields: telegram_id, package_id' });
        }

        // Verify package exists
        const packages = await TokenBilling.getAvailablePackages();
        const pkg = packages.find(p => p.package_id === package_id);

        if (!pkg) {
            return res.status(404).json({ error: 'Package not found or inactive' });
        }

        // Purchase package (adds tokens to user balance)
        const result = await TokenBilling.purchasePackage(telegram_id, package_id);

        res.json({
            success: true,
            message: 'Package purchased successfully',
            balance_tokens: result.balance_tokens,
            tokens_purchased: result.tokens_purchased,
            package_id,
            package_name: pkg.name
        });
    } catch (error) {
        console.error('[BILLING] POST /purchase error:', error);

        if (error.message.includes('Package not found')) {
            return res.status(404).json({ error: 'Package not found' });
        }

        res.status(500).json({ error: error.message });
    }
});

// ==================== ADMIN ENDPOINTS ====================

/**
 * GET /api/billing/users
 * Get list of all users with their balance information
 */
router.get('/users', requireAdminAuth, async (req, res) => {
    try {
        const { search, limit = 100, offset = 0, sort = 'balance' } = req.query;
        const parsedLimit = Math.min(parseInt(limit) || 100, 500);
        const parsedOffset = parseInt(offset) || 0;

        // For now, return mock data since we don't have a direct users endpoint
        // In production, this would query the database directly
        // TODO: Implement user list query from central database

        res.json({
            users: [],
            total: 0,
            limit: parsedLimit,
            offset: parsedOffset,
            message: 'User listing endpoint requires database schema implementation'
        });
    } catch (error) {
        console.error('[BILLING] GET /users error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/billing/user/:id/transactions
 * Get full transaction history for a specific user (admin only)
 */
router.get('/user/:id/transactions', requireAdminAuth, async (req, res) => {
    try {
        const { id: telegram_id } = req.params;
        const { limit = 100, offset = 0 } = req.query;

        const parsedLimit = Math.min(parseInt(limit) || 100, 1000);
        const parsedOffset = parseInt(offset) || 0;

        const balance = await TokenBilling.getBalance(telegram_id);
        let transactions = await TokenBilling.getTransactions(telegram_id, parsedLimit + parsedOffset + 100);

        const total = transactions.length;
        transactions = transactions.slice(parsedOffset, parsedOffset + parsedLimit);

        res.json({
            telegram_id: parseInt(telegram_id),
            username: null, // Would be fetched from users table
            balance_current: balance.balance_tokens || 0,
            transactions: transactions.map(t => ({
                id: t.id,
                amount: t.amount,
                reason: t.reason,
                model: t.model || null,
                prompt_tokens: t.prompt_tokens || null,
                completion_tokens: t.completion_tokens || null,
                created_at: t.created_at
            })),
            total,
            limit: parsedLimit,
            offset: parsedOffset
        });
    } catch (error) {
        console.error('[BILLING] GET /user/:id/transactions error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/billing/user/:id/balance
 * Manually adjust user's token balance (admin only)
 */
router.post('/user/:id/balance', requireAdminAuth, async (req, res) => {
    try {
        const { id: telegram_id } = req.params;
        const { amount, reason } = req.body;

        // Validation
        if (!amount || amount === 0) {
            return res.status(400).json({ error: 'Amount must be non-zero' });
        }

        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            return res.status(400).json({ error: 'Reason is required' });
        }

        const parsedAmount = parseInt(amount);
        if (isNaN(parsedAmount)) {
            return res.status(400).json({ error: 'Amount must be numeric' });
        }

        // Get balance before
        const balanceBefore = await TokenBilling.getBalance(telegram_id);

        // Check if subtraction would result in negative balance
        if (parsedAmount < 0 && (balanceBefore.balance_tokens || 0) + parsedAmount < 0) {
            return res.status(422).json({
                error: 'Insufficient balance for this operation',
                current_balance: balanceBefore.balance_tokens
            });
        }

        // Perform the adjustment
        await TokenBilling.addTokens(
            telegram_id,
            parsedAmount,
            `Admin adjustment: ${reason}`
        );

        // Get balance after
        const balanceAfter = await TokenBilling.getBalance(telegram_id);

        res.json({
            success: true,
            message: 'Balance adjusted successfully',
            telegram_id: parseInt(telegram_id),
            balance_before: balanceBefore.balance_tokens || 0,
            balance_after: balanceAfter.balance_tokens || 0,
            adjustment_amount: parsedAmount,
            reason
        });
    } catch (error) {
        console.error('[BILLING] POST /user/:id/balance error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/billing/stats
 * Get billing statistics dashboard data (admin only)
 */
router.get('/stats', requireAdminAuth, async (req, res) => {
    try {
        // TODO: Implement comprehensive stats from database
        // For now, return placeholder structure

        res.json({
            total_users: 0,
            active_users_today: 0,
            active_users_this_month: 0,
            tokens: {
                total_issued_lifetime: 0,
                total_consumed_lifetime: 0,
                total_available: 0,
                average_balance_per_user: 0
            },
            revenue: {
                total_packages_purchased: 0,
                estimated_revenue_rub: 0
            },
            daily_stats: [],
            top_spenders: [],
            message: 'Stats endpoint requires database schema implementation'
        });
    } catch (error) {
        console.error('[BILLING] GET /stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
