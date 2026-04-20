const { Pool } = require('pg');
const config = require('../config');

/**
 * Token Billing Service - Consumption-based token management for Docker-Claw
 *
 * Implements pay-as-you-go model:
 * - Users purchase token packages (predefined options at various price points)
 * - Tokens persist indefinitely until consumed
 * - No monthly resets or expiration
 * - Every consumption is logged with model name and reason
 *
 * Key Principle: Tokens are spent ONLY on LLM calls (Agent Loop + Content Pipeline).
 * Docker, per-user DB, MySQL skills, and file operations do NOT consume tokens.
 */

// Central PostgreSQL pool (clientzavod database)
const pool = new Pool({
    host: config.PG_HOST,
    port: config.PG_PORT,
    user: config.PG_USER,
    password: config.PG_PASSWORD,
    database: 'clientzavod',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

class TokenBilling {
    /**
     * Get user token balance
     * @param {number|string} telegramId
     * @returns {Promise<{balance_tokens: number}>}
     */
    static async getBalance(telegramId) {
        const res = await pool.query(
            'SELECT balance_tokens FROM users WHERE telegram_id = $1',
            [telegramId]
        );
        return res.rows[0] || { balance_tokens: 0 };
    }

    /**
     * Spend tokens from user balance
     * @param {number|string} telegramId
     * @param {number} promptTokens
     * @param {number} completionTokens
     * @param {string} model
     * @param {string} reason
     * @returns {Promise<number>} total tokens spent
     * @throws {Error} with code 'NOT_ENOUGH_TOKENS' if insufficient balance
     */
    static async spendTokens(telegramId, promptTokens, completionTokens, model, reason) {
        // Apply 15% buffer for tool-calling overhead (like pro-talk.ru)
        const total = Math.ceil(promptTokens + completionTokens * 1.15);

        const balance = await this.getBalance(telegramId);

        if (balance.balance_tokens < total) {
            const error = new Error('NOT_ENOUGH_TOKENS');
            error.code = 'NOT_ENOUGH_TOKENS';
            error.balance = balance.balance_tokens;
            error.required = total;
            throw error;
        }

        // Deduct from balance using transaction for atomicity
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Deduct from balance
            await client.query(`
                UPDATE users
                SET balance_tokens = balance_tokens - $2
                WHERE telegram_id = $1
            `, [telegramId, total]);

            // Record transaction
            await client.query(`
                INSERT INTO token_transactions
                (telegram_id, amount, reason, model, prompt_tokens, completion_tokens)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [telegramId, -total, reason, model, promptTokens, completionTokens]);

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        return total;
    }

    /**
     * Add tokens (payment, monthly reset, bonus)
     * @param {number|string} telegramId
     * @param {number} amount
     * @param {string} reason
     */
    static async addTokens(telegramId, amount, reason) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Add to balance
            await client.query(`
                UPDATE users
                SET balance_tokens = balance_tokens + $2
                WHERE telegram_id = $1
            `, [telegramId, amount]);

            // Record transaction
            await client.query(`
                INSERT INTO token_transactions
                (telegram_id, amount, reason)
                VALUES ($1, $2, $3)
            `, [telegramId, amount, reason]);

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Purchase token package
     * Adds tokens to user balance and records transaction
     * @param {number|string} telegramId
     * @param {string} packageId - package ID from token_packages table
     * @returns {Promise<{balance_tokens: number, tokens_purchased: number}>}
     */
    static async purchasePackage(telegramId, packageId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get package details
            const pkgRes = await client.query(
                'SELECT tokens_amount FROM token_packages WHERE package_id = $1 AND is_active = true',
                [packageId]
            );

            if (!pkgRes.rows[0]) {
                throw new Error(`Invalid package: ${packageId}`);
            }

            const tokensAmount = pkgRes.rows[0].tokens_amount;

            // Add tokens to balance
            await client.query(`
                UPDATE users
                SET balance_tokens = balance_tokens + $2
                WHERE telegram_id = $1
            `, [telegramId, tokensAmount]);

            // Record transaction
            await client.query(`
                INSERT INTO token_transactions
                (telegram_id, amount, reason)
                VALUES ($1, $2, $3)
            `, [telegramId, tokensAmount, `Package purchase: ${packageId}`]);

            // Get new balance
            const balRes = await client.query(
                'SELECT balance_tokens FROM users WHERE telegram_id = $1',
                [telegramId]
            );

            await client.query('COMMIT');

            return {
                balance_tokens: balRes.rows[0]?.balance_tokens || 0,
                tokens_purchased: tokensAmount
            };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Get transaction history for user
     * @param {number|string} telegramId
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    static async getTransactions(telegramId, limit = 50) {
        const res = await pool.query(`
            SELECT id, amount, reason, model, prompt_tokens, completion_tokens, created_at
            FROM token_transactions
            WHERE telegram_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        `, [telegramId, limit]);

        return res.rows;
    }

    /**
     * Get available token packages for purchase
     * @returns {Promise<Array>} list of token packages
     */
    static async getAvailablePackages() {
        const res = await pool.query(
            'SELECT package_id, name, tokens_amount, price_rub FROM token_packages WHERE is_active = true ORDER BY tokens_amount'
        );
        return res.rows;
    }

    /**
     * Check if user can spend tokens (without deducting)
     * @param {number|string} telegramId
     * @param {number} requiredTokens
     * @returns {Promise<boolean>}
     */
    static async canAfford(telegramId, requiredTokens) {
        const balance = await this.getBalance(telegramId);
        return balance.balance_tokens >= requiredTokens;
    }

    /**
     * Estimate tokens for a prompt (simple approximation)
     * For production accuracy, integrate tiktoken library
     * @param {string} text
     * @param {string} model
     * @returns {number}
     */
    static estimateTokens(text, model = 'gpt-4o') {
        // Rough estimate: 1 token ≈ 4 characters for English, 1.5 for Russian
        const charCount = text.length;
        const avgTokenLength = model.includes('gpt') ? 4 : 3.5;
        return Math.ceil(charCount / avgTokenLength);
    }


    /**
     * Get total tokens spent by user in a date range
     * @param {number|string} telegramId
     * @param {Date} startDate
     * @param {Date} endDate
     * @returns {Promise<{total_spent: number, transaction_count: number}>}
     */
    static async getTokenUsage(telegramId, startDate, endDate) {
        const res = await pool.query(`
            SELECT 
                COALESCE(SUM(ABS(amount)), 0) as total_spent,
                COUNT(*) as transaction_count
            FROM token_transactions
            WHERE telegram_id = $1
              AND amount < 0
              AND created_at >= $2
              AND created_at <= $3
        `, [telegramId, startDate, endDate]);

        return res.rows[0] || { total_spent: 0, transaction_count: 0 };
    }

    /**
     * Check if billing is enabled via environment variable
     * @returns {boolean}
     */
    static isBillingEnabled() {
        return process.env.BILLING_ENABLED === 'true';
    }

    /**
     * Get default free tokens from environment variable
     * @returns {number}
     */
    static getDefaultFreeTokens() {
        return parseInt(process.env.DEFAULT_FREE_TOKENS || '100000', 10);
    }
}

module.exports = TokenBilling;
