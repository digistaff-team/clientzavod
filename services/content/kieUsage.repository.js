/**
 * KIE.ai Daily Usage Repository
 * Атомарный счётчик вызовов KIE.ai в per-user PostgreSQL БД.
 * Таблица создаётся при первом вызове ensureKieUsageSchema().
 */
const { withClient } = require('./repository');

const DDL = `
  CREATE TABLE IF NOT EXISTS kie_daily_usage (
    id BIGSERIAL PRIMARY KEY,
    call_date DATE NOT NULL DEFAULT CURRENT_DATE,
    call_count INT NOT NULL DEFAULT 0,
    UNIQUE (call_date)
  )
`;

async function ensureKieUsageSchema(chatId) {
  return withClient(chatId, async (client) => {
    await client.query(DDL);
  });
}

async function incrementAndGetKieCallCount(chatId) {
  return withClient(chatId, async (client) => {
    const result = await client.query(
      `INSERT INTO kie_daily_usage (call_date, call_count)
       VALUES (CURRENT_DATE, 1)
       ON CONFLICT (call_date)
       DO UPDATE SET call_count = kie_daily_usage.call_count + 1
       RETURNING call_count`
    );
    return result.rows[0].call_count;
  });
}

async function decrementKieCallCount(chatId) {
  return withClient(chatId, async (client) => {
    await client.query(
      `UPDATE kie_daily_usage
       SET call_count = GREATEST(0, call_count - 1)
       WHERE call_date = CURRENT_DATE`
    );
  });
}

async function getKieCallCount(chatId) {
  return withClient(chatId, async (client) => {
    const result = await client.query(
      `SELECT call_count FROM kie_daily_usage WHERE call_date = CURRENT_DATE`
    );
    return result.rows[0]?.call_count || 0;
  });
}

module.exports = {
  ensureKieUsageSchema,
  incrementAndGetKieCallCount,
  decrementKieCallCount,
  getKieCallCount
};
