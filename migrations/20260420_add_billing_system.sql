-- Migration: Add Token Billing System (Pay-as-you-go)
-- Created: 2026-04-20
-- Purpose: Implement consumption-based token billing with persistent balance

-- ===== 1. Add billing columns to users table =====
-- balance_tokens: user's current token balance (persistent, no monthly reset)
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_tokens BIGINT DEFAULT 0;

-- ===== 2. Create token_transactions table =====
-- Logs every token purchase and consumption for audit trail
CREATE TABLE IF NOT EXISTS token_transactions (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  amount BIGINT NOT NULL,               -- positive = purchase, negative = consumption
  reason VARCHAR(255),                  -- e.g., "Payment: xyz", "Agent Loop iteration", "Image generation"
  model VARCHAR(100),                   -- AI model used (e.g., "gpt-4o", null for payments)
  prompt_tokens INTEGER,                -- for consumption: input tokens
  completion_tokens INTEGER,            -- for consumption: output tokens
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

-- Create indexes for fast queries and auditing
CREATE INDEX IF NOT EXISTS idx_token_transactions_telegram_id ON token_transactions(telegram_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_created_at ON token_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_token_transactions_reason ON token_transactions(reason);

-- ===== 3. Create token_packages table =====
-- Pre-defined purchase options (like App Store IAP)
CREATE TABLE IF NOT EXISTS token_packages (
  package_id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  tokens_amount BIGINT NOT NULL,
  price_rub DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert standard package options
INSERT INTO token_packages (package_id, name, tokens_amount, price_rub, is_active)
VALUES
  ('starter', 'Стартовый (100K токенов)', 100000, 99.00, true),
  ('pro', 'Профессиональный (1M токенов)', 1000000, 499.00, true),
  ('enterprise', 'Корпоративный (10M токенов)', 10000000, 1999.00, true)
ON CONFLICT (package_id) DO NOTHING;

-- ===== 4. Create token_balance_history table =====
-- Optional: track balance snapshots for analytics and dispute resolution
CREATE TABLE IF NOT EXISTS token_balance_history (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  balance_before BIGINT,
  balance_after BIGINT,
  transaction_id INTEGER,                -- reference to token_transactions.id
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES token_transactions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_balance_history_telegram_id ON token_balance_history(telegram_id);
CREATE INDEX IF NOT EXISTS idx_balance_history_recorded_at ON token_balance_history(recorded_at);
