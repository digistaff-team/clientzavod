-- =====================================================
-- CONTENT MANAGEMENT SYSTEM DATABASE SCHEMA
-- Docker-Claw Project - Multi-Channel Publishing
-- =====================================================

-- Включаем расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. ОСНОВНАЯ ТАБЛИЦА: content_queue
-- =====================================================

CREATE TABLE content_queue (
    -- ========== ИДЕНТИФИКАТОРЫ ==========
    id BIGSERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    
    -- ========== ВЛАДЕЛЕЦ / СЕССИЯ (Docker-Claw интеграция) ==========
    user_id VARCHAR(100),              -- chat_id или user_id из Docker-Claw
    session_id VARCHAR(100),           -- session_id из Docker-Claw
    workspace_id VARCHAR(100),         -- /workspace путь
    
    -- ========== КОНТЕНТ: БАЗА ==========
    topic TEXT NOT NULL,               -- Тема из плана (темы.xlsx)
    channel VARCHAR(50) NOT NULL,      -- telegram|facebook|instagram|vk|ok|zen|tiktok|pinterest|youtube|blog|email
    content_type VARCHAR(30) DEFAULT 'post', -- post|article|video|pin|reel|story|newsletter
    
    -- ========== КОНТЕНТ: ТЕКСТ ==========
    title VARCHAR(500),                -- Заголовок (обязателен для YouTube, Blog, Zen, Pinterest)
    body_text TEXT,                    -- Основной текст
    short_description VARCHAR(1000),   -- Краткое описание (для Pinterest, SEO, Email subject)
    
    -- ========== КОНТЕНТ: SEO & КЛЮЧИ (из темы.xlsx) ==========
    focus_keyword VARCHAR(255),        -- Фокусный ключ
    secondary_keywords JSONB,          -- ["ключ1", "ключ2"] - Вторичные ключи
    lsi_keywords JSONB,                -- ["lsi1", "lsi2"] - LSI-ключи
    hashtags TEXT,                     -- #хештег1 #хештег2 (для IG, VK, TikTok, Pinterest)
    
    -- ========== КОНТЕНТ: МЕДИА ==========
    primary_image_url TEXT,            -- Основное изображение
    primary_image_prompt TEXT,         -- Промпт для генерации
    thumbnail_url TEXT,                -- Превью (для видео)
    video_url TEXT,                    -- URL видео (YouTube, TikTok, VK)
    media_assets JSONB DEFAULT '[]'::jsonb, -- Массив дополнительных медиа
    
    -- ========== КАНАЛ-СПЕЦИФИЧНЫЕ ДАННЫЕ ==========
    channel_config JSONB DEFAULT '{}'::jsonb,
    -- Примеры:
    -- Telegram: {"chat_id": "123", "channel_id": "-100...", "disable_notification": false}
    -- Pinterest: {"board_id": "980870062533264681", "board_name": "Клиент-завод", "link": "https://..."}
    -- Instagram: {"location_id": "...", "alt_text": "...", "is_reel": false}
    -- VK: {"group_id": "...", "post_type": "post|article|video"}
    -- OK: {"group_id": "...", "age_restrict": "18+"}
    -- Zen: {"channel_id": "...", "publication_type": "article|post|video", "tags": [...]}
    -- TikTok: {"privacy": "public", "allow_duet": true, "allow_stitch": true}
    -- YouTube: {"category": "Education", "privacy": "public", "tags": [...]}
    -- Blog: {"slug": "...", "author_id": "...", "category": "..."}
    -- Email: {"subject": "...", "recipients": [...], "template": "..."}
    
    -- ========== СТАТУСЫ & WORKFLOW ==========
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    -- draft → pending → processing → generated → waiting_approval → approved → scheduled → publishing → published | rejected | failed
    
    priority INTEGER DEFAULT 0,        -- Приоритет (0-10)
    scheduled_at TIMESTAMP WITH TIME ZONE,  -- Запланированное время публикации
    published_at TIMESTAMP WITH TIME ZONE,  -- Фактическое время публикации
    
    -- ========== ПУБЛИКАЦИЯ: РЕЗУЛЬТАТЫ ==========
    published_url TEXT,                -- Ссылка на опубликованный контент
    published_post_id VARCHAR(200),    -- ID поста в канале (для редактирования/удаления)
    published_channel_data JSONB,      -- Данные от канала после публикации
    
    -- ========== APPROVAL (Human-in-the-Loop) ==========
    approval_required BOOLEAN DEFAULT true,
    approval_chat_id VARCHAR(100),     -- Chat ID для согласования
    approval_message_id BIGINT,        -- ID сообщения с черновиком
    approved_by VARCHAR(100),          -- Кто одобрил (user_id)
    approved_at TIMESTAMP WITH TIME ZONE,
    approval_comments TEXT,            -- Комментарии при одобрении/отклонении
    
    -- ========== ИСТОЧНИК & КАМПАНИЯ ==========
    source VARCHAR(50) DEFAULT 'manual', -- manual|excel_import|google_sheets|api|ai_generated
    source_file VARCHAR(255),          -- Имя файла (темы.xlsx, пинтерест.xlsx)
    source_row INTEGER,                -- Номер строки в источнике
    campaign_id VARCHAR(100),          -- ID кампании (для аналитики)
    campaign_name VARCHAR(255),        -- Название кампании
    
    -- ========== AI ГЕНЕРАЦИЯ ==========
    ai_model VARCHAR(50),              -- claude|gpt4|qwen|ollama
    ai_prompt TEXT,                    -- Промпт использованный для генерации
    ai_tokens_used INTEGER,            -- Количество токенов
    ai_generation_time INTEGER,        -- Время генерации в секундах
    ai_metadata JSONB DEFAULT '{}'::jsonb, -- Дополнительные метаданные AI
    
    -- ========== ОШИБКИ & ПОВТОРЫ ==========
    error_message TEXT,
    error_details JSONB,
    error_code VARCHAR(50),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_retry_at TIMESTAMP WITH TIME ZONE,
    
    -- ========== ВРЕМЕННЫЕ МЕТКИ ==========
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,  -- Soft delete
    
    -- ========== ДОПОЛНИТЕЛЬНО ==========
    metadata JSONB DEFAULT '{}'::jsonb,  -- Любые дополнительные данные
    tags TEXT[]                          -- Массив тегов для внутренней категоризации
);

-- =====================================================
-- 2. ТАБЛИЦА: content_channels (Настройки каналов)
-- =====================================================

CREATE TABLE content_channels (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    
    channel_name VARCHAR(50) NOT NULL, -- telegram|facebook|instagram|...
    channel_type VARCHAR(30) NOT NULL, -- social|blog|email|video
    
    -- Идентификаторы канала
    channel_id VARCHAR(200) NOT NULL,  -- ID канала/группы/страницы
    channel_name_display VARCHAR(255), -- Отображаемое имя
    channel_username VARCHAR(255),     -- @username для Telegram
    
    -- Аутентификация
    auth_type VARCHAR(30) DEFAULT 'token', -- token|oauth|api_key
    access_token TEXT,                 -- Токен доступа (шифровать!)
    access_token_expires TIMESTAMP WITH TIME ZONE,
    refresh_token TEXT,                -- Refresh токен
    api_key TEXT,                      -- API ключ (шифровать!)
    api_secret TEXT,                   -- API секрет (шифровать!)
    
    -- Настройки публикации
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,  -- Канал по умолчанию
    auto_publish BOOLEAN DEFAULT false, -- Автопубликация без модерации
    schedule_timezone VARCHAR(50) DEFAULT 'UTC',
    
    -- Лимиты и настройки
    daily_limit INTEGER,               -- Лимит публикаций в день
    weekly_limit INTEGER,              -- Лимит публикаций в неделю
    posting_hours JSONB,               -- {"start": "09:00", "end": "21:00", "days": [1,2,3,4,5]}
    
    -- Метаданные канала
    channel_metadata JSONB DEFAULT '{}'::jsonb,
    -- Telegram: {"bot_token": "...", "is_bot": true}
    -- Facebook: {"page_id": "...", "page_access_token": "..."}
    -- Instagram: {"ig_user_id": "...", "fb_page_id": "..."}
    -- VK: {"group_id": "...", "service_key": "..."}
    -- OK: {"app_id": "...", "access_token": "..."}
    -- Zen: {"channel_id": "...", "api_key": "..."}
    -- TikTok: {"app_key": "...", "client_key": "..."}
    -- Pinterest: {"board_id": "...", "access_token": "..."}
    -- YouTube: {"channel_id": "...", "client_id": "..."}
    -- Blog: {"cms_url": "...", "api_key": "..."}
    -- Email: {"smtp_host": "...", "smtp_port": 587, "from_email": "..."}
    
    -- Статистика
    total_posts INTEGER DEFAULT 0,
    last_post_at TIMESTAMP WITH TIME ZONE,
    
    -- Временные метки
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, channel_name, channel_id)
);

-- =====================================================
-- 3. ТАБЛИЦА: content_analytics (Метрики публикаций)
-- =====================================================

CREATE TABLE content_analytics (
    id BIGSERIAL PRIMARY KEY,
    content_id BIGINT REFERENCES content_queue(id) ON DELETE CASCADE,
    channel_id BIGINT REFERENCES content_channels(id) ON DELETE CASCADE,
    
    -- Основные метрики
    views BIGINT DEFAULT 0,
    likes BIGINT DEFAULT 0,
    shares BIGINT DEFAULT 0,
    comments BIGINT DEFAULT 0,
    clicks BIGINT DEFAULT 0,
    saves BIGINT DEFAULT 0,            -- Для Pinterest, Instagram
    
    -- Канал-специфичные метрики
    channel_metrics JSONB DEFAULT '{}'::jsonb,
    -- Telegram: {"forwards": 5, "reactions": {"👍": 10, "🔥": 5}, "reach": 1500}
    -- Facebook: {"reach": 2500, "impressions": 5000, "engagement_rate": 3.5}
    -- Instagram: {"reach": 1800, "impressions": 3200, "engagement_rate": 4.2, "profile_visits": 45}
    -- VK: {"reach": 2000, "impressions": 4500, "engagement_rate": 3.8}
    -- OK: {"reach": 1500, "impressions": 3000}
    -- Zen: {"views": 5000, "read_time": 180, "likes": 250, "comments": 45, "subscribers_gained": 12}
    -- TikTok: {"views": 15000, "likes": 1200, "shares": 85, "comments": 95, "watch_time": 4500}
    -- Pinterest: {"impressions": 8000, "saves": 350, "clicks": 120, "pin_clicks": 95}
    -- YouTube: {"views": 3500, "watch_time": 12500, "likes": 280, "comments": 45, "subscribers_gained": 25}
    -- Blog: {"views": 2500, "unique_visitors": 1800, "avg_time_on_page": 145, "bounce_rate": 35}
    -- Email: {"sent": 500, "delivered": 495, "opened": 250, "clicked": 85, "unsubscribed": 3}
    
    -- Конверсии
    conversions BIGINT DEFAULT 0,
    conversion_value DECIMAL(12,2) DEFAULT 0,
    conversion_metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Период сбора
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(content_id, channel_id, collected_at)
);

-- =====================================================
-- 4. ТАБЛИЦА: content_templates (Шаблоны контента)
-- =====================================================

CREATE TABLE content_templates (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    
    name VARCHAR(200) NOT NULL,
    description TEXT,
    channel VARCHAR(50) NOT NULL,
    content_type VARCHAR(30) DEFAULT 'post',
    
    -- Шаблон контента (использует переменные {{variable}})
    title_template TEXT,
    body_template TEXT,
    short_description_template TEXT,
    
    -- Промпты для AI
    ai_prompt_template TEXT,
    ai_image_prompt_template TEXT,
    
    -- Настройки по умолчанию
    default_channel_config JSONB DEFAULT '{}'::jsonb,
    default_hashtags TEXT,
    default_priority INTEGER DEFAULT 0,
    
    -- SEO шаблон
    focus_keyword_template VARCHAR(255),
    secondary_keywords_template JSONB,
    
    -- Статус
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,   -- Системный шаблон (не удаляется пользователем)
    
    -- Статистика использования
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Временные метки
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, name, channel)
);

-- =====================================================
-- 5. ТАБЛИЦА: content_assets (Медиафайлы)
-- =====================================================

CREATE TABLE content_assets (
    id BIGSERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    
    content_id BIGINT REFERENCES content_queue(id) ON DELETE CASCADE,
    
    -- Информация о файле
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,    -- image|video|audio|document
    mime_type VARCHAR(100),
    file_size BIGINT,                  -- Размер в байтах
    
    -- Хранение
    storage_type VARCHAR(30) DEFAULT 'local', -- local|s3|gcs|url
    storage_path TEXT,                 -- Путь к файлу или URL
    public_url TEXT,                   -- Публичный URL
    
    -- Метаданные медиа
    width INTEGER,
    height INTEGER,
    duration INTEGER,                  -- Для видео/аудио (в секундах)
    alt_text TEXT,                     -- Alt текст для доступности
    caption TEXT,                      -- Подпись к медиа
    
    -- AI генерация
    ai_generated BOOLEAN DEFAULT false,
    ai_model VARCHAR(50),
    ai_prompt TEXT,
    
    -- Использование
    usage_count INTEGER DEFAULT 0,
    
    -- Временные метки
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_content_assets_content_id (content_id),
    INDEX idx_content_assets_user_id (user_id)
);

-- =====================================================
-- 6. ТАБЛИЦА: content_workflow (Лог изменений статуса)
-- =====================================================

CREATE TABLE content_workflow (
    id BIGSERIAL PRIMARY KEY,
    content_id BIGINT REFERENCES content_queue(id) ON DELETE CASCADE,
    
    -- Изменение статуса
    from_status VARCHAR(30),
    to_status VARCHAR(30) NOT NULL,
    
    -- Кто инициировал
    user_id VARCHAR(100),
    action_type VARCHAR(50),           -- create|update|approve|reject|publish|schedule|retry|fail
    
    -- Комментарий
    comment TEXT,
    
    -- Метаданные действия
    action_metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Временные метки
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_content_workflow_content_id (content_id),
    INDEX idx_content_workflow_status (to_status)
);

-- =====================================================
-- 7. ТАБЛИЦА: content_import_sources (Источники импорта)
-- =====================================================

CREATE TABLE content_import_sources (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    
    source_name VARCHAR(200) NOT NULL,
    source_type VARCHAR(50) NOT NULL, -- excel|google_sheets|csv|api|rss
    
    -- Конфигурация источника
    source_config JSONB DEFAULT '{}'::jsonb,
    -- Excel: {"file_path": "/path/to/темы.xlsx", "sheet_name": "План"}
    -- Google Sheets: {"sheet_id": "...", "range": "A:F", "credentials": "..."}
    -- API: {"endpoint": "...", "auth_type": "bearer", "token": "..."}
    -- RSS: {"url": "...", "update_interval": 3600}
    
    -- Маппинг полей
    field_mapping JSONB DEFAULT '{}'::jsonb,
    -- {"topic": "B", "focus_keyword": "C", "secondary_keywords": "D", "lsi_keywords": "E"}
    
    -- Статус
    is_active BOOLEAN DEFAULT true,
    last_import_at TIMESTAMP WITH TIME ZONE,
    last_import_status VARCHAR(30),    -- success|failed|partial
    last_import_error TEXT,
    
    -- Статистика
    total_imported INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    
    -- Временные метки
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, source_name)
);

-- =====================================================
-- ИНДЕКСЫ ДЛЯ content_queue
-- =====================================================

-- Для поиска задач по статусу и каналу
CREATE INDEX idx_content_queue_status_channel ON content_queue(status, channel);
CREATE INDEX idx_content_queue_channel_status ON content_queue(channel, status);

-- Для поиска pending задач (cron worker)
CREATE INDEX idx_content_queue_pending ON content_queue(status, created_at ASC) WHERE status = 'pending';

-- Для поиска по расписанию
CREATE INDEX idx_content_queue_scheduled ON content_queue(scheduled_at) WHERE status IN ('scheduled', 'approved');

-- Для аналитики по кампаниям
CREATE INDEX idx_content_queue_campaign ON content_queue(campaign_id) WHERE campaign_id IS NOT NULL;

-- Для поиска по источнику
CREATE INDEX idx_content_queue_source ON content_queue(source, created_at DESC);

-- Для поиска по пользователю/сессии (Docker-Claw)
CREATE INDEX idx_content_queue_user ON content_queue(user_id, created_at DESC);
CREATE INDEX idx_content_queue_session ON content_queue(session_id, created_at DESC);

-- Для поиска по датам публикации
CREATE INDEX idx_content_queue_published_at ON content_queue(published_at DESC) WHERE published_at IS NOT NULL;

-- GIN индексы для JSONB полей
CREATE INDEX idx_content_queue_channel_config_gin ON content_queue USING GIN (channel_config);
CREATE INDEX idx_content_queue_metadata_gin ON content_queue USING GIN (metadata);
CREATE INDEX idx_content_queue_secondary_keywords_gin ON content_queue USING GIN (secondary_keywords);
CREATE INDEX idx_content_queue_lsi_keywords_gin ON content_queue USING GIN (lsi_keywords);

-- Полнотекстовый поиск по контенту
CREATE INDEX idx_content_queue_search ON content_queue USING GIN (to_tsvector('russian', COALESCE(title, '') || ' ' || COALESCE(body_text, '')));

-- =====================================================
-- ТРИГГЕРЫ
-- =====================================================

-- Авто-обновление updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_content_queue_updated_at BEFORE UPDATE ON content_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_channels_updated_at BEFORE UPDATE ON content_channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_templates_updated_at BEFORE UPDATE ON content_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Триггер для логирования изменений статуса
CREATE OR REPLACE FUNCTION log_content_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO content_workflow (content_id, from_status, to_status, user_id, action_type, action_metadata)
        VALUES (NEW.id, OLD.status, NEW.status, NEW.user_id, 'status_change', '{"auto": true}'::jsonb);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_queue_status_change_trigger AFTER UPDATE ON content_queue
    FOR EACH ROW EXECUTE FUNCTION log_content_status_change();

-- =====================================================
-- ПРЕДСТАВЛЕНИЯ (VIEWS)
-- =====================================================

-- Статистика по каналам
CREATE OR REPLACE VIEW content_stats_by_channel AS
SELECT 
    channel,
    status,
    COUNT(*) as count,
    COUNT(CASE WHEN status = 'published' THEN 1 END) as published_count,
    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
    MIN(created_at) as oldest,
    MAX(created_at) as newest,
    AVG(CASE WHEN status = 'published' THEN EXTRACT(EPOCH FROM (published_at - created_at))/3600 END) as avg_hours_to_publish
FROM content_queue
WHERE deleted_at IS NULL
GROUP BY channel, status
ORDER BY channel, status;

-- Контент для публикации сегодня
CREATE OR REPLACE VIEW content_due_today AS
SELECT 
    id,
    uuid,
    channel,
    content_type,
    title,
    topic,
    status,
    priority,
    scheduled_at,
    channel_config,
    user_id
FROM content_queue
WHERE 
    deleted_at IS NULL
    AND status IN ('pending', 'approved', 'scheduled')
    AND (scheduled_at IS NULL OR scheduled_at <= NOW())
ORDER BY 
    priority DESC,
    scheduled_at ASC NULLS FIRST,
    created_at ASC;

-- Контент, требующий одобрения
CREATE OR REPLACE VIEW content_pending_approval AS
SELECT 
    id,
    channel,
    title,
    topic,
    approval_chat_id,
    approval_message_id,
    created_at,
    user_id
FROM content_queue
WHERE 
    deleted_at IS NULL
    AND status = 'waiting_approval'
ORDER BY created_at DESC;

-- Аналитика по кампаниям
CREATE OR REPLACE VIEW content_campaign_analytics AS
SELECT 
    campaign_id,
    campaign_name,
    channel,
    COUNT(*) as total_posts,
    COUNT(CASE WHEN status = 'published' THEN 1 END) as published,
    SUM(COALESCE(a.views, 0)) as total_views,
    SUM(COALESCE(a.likes, 0)) as total_likes,
    SUM(COALESCE(a.shares, 0)) as total_shares,
    SUM(COALESCE(a.conversions, 0)) as total_conversions,
    SUM(COALESCE(a.conversion_value, 0)) as total_conversion_value
FROM content_queue cq
LEFT JOIN content_analytics a ON cq.id = a.content_id
WHERE cq.deleted_at IS NULL AND cq.campaign_id IS NOT NULL
GROUP BY campaign_id, campaign_name, channel
ORDER BY total_views DESC;

-- =====================================================
-- ПРИМЕРЫ ДАННЫХ (из ваших Excel файлов)
-- =====================================================

-- Пример 1: Telegram пост (Fancy Selective - парфюмерия)
INSERT INTO content_queue (
    user_id, topic, channel, content_type, title, body_text,
    focus_keyword, secondary_keywords, lsi_keywords, hashtags,
    channel_config, source, source_file, source_row
) VALUES (
    '128247430',
    'Как пахнуть дорого за 500 рублей: честный обзор стойкого аналога Black Opium',
    'telegram',
    'post',
    '💎 Как пахнуть дорого за 500 рублей?',
    'Честный обзор стойкого аналога Black Opium от Fancy Selective...',
    'аналог блэк опиум',
    '["духи по мотивам черного опиума", "масляные духи черного опиума"]'::jsonb,
    '["шлейфовый парфюм", "кофейные ноты", "селективная база", "стойкость аромата"]'::jsonb,
    '#парфюм #масляныедухи #FancySelective #аналогидухов',
    '{"chat_id": "128247430", "channel_id": "-1001234567890", "disable_notification": false}'::jsonb,
    'excel_import',
    'темы.xlsx',
    2
);

-- Пример 2: Pinterest пин (Client Factory - B2B)
INSERT INTO content_queue (
    user_id, topic, channel, content_type, title, short_description,
    focus_keyword, secondary_keywords, hashtags,
    channel_config, source, source_file, source_row
) VALUES (
    '128247430',
    '7 признаков того, что маркетинг держится на одном человеке',
    'pinterest',
    'pin',
    'Клиент-завод: система заявок из контента',
    'Пошаговая схема выстраивания стабильного потока клиентов...',
    'системный маркетинг',
    '["клиент-завод", "рост бизнеса", "автоматизация заявок"]'::jsonb,
    '#маркетинг #бизнес #клиентзавод #автоматизация',
    '{"board_id": "980870062533264681", "board_name": "Клиент-завод", "link": "https://client-factory-score.lovable.app/"}'::jsonb,
    'excel_import',
    'Копия пинтерест.xlsx',
    1
);

-- Пример 3: Яндекс-Дзен статья
INSERT INTO content_queue (
    user_id, topic, channel, content_type, title, body_text, short_description,
    focus_keyword, channel_config, source
) VALUES (
    '128247430',
    'Контент-завод: пошаговая схема',
    'zen',
    'article',
    'Контент-завод: как каждый пост превращать в заявки',
    '# Введение\n\nКонтент может стать стабильным каналом...\n\n## Шаг 1...',
    'Узнайте, как выстроить систему контент-маркетинга...',
    'контент завод',
    '{"channel_id": "abcdef123456", "publication_type": "article", "tags": ["маркетинг", "бизнес"], "enable_comments": true}'::jsonb,
    'manual'
);

-- =====================================================
-- ПОЛЕЗНЫЕ ЗАПРОСЫ
-- =====================================================

-- Получить следующую задачу для обработки (cron worker)
SELECT * FROM content_queue 
WHERE status = 'pending' 
    AND deleted_at IS NULL
ORDER BY priority DESC, created_at ASC 
LIMIT 1;

-- Получить контент для конкретного канала
SELECT * FROM content_queue 
WHERE channel = 'telegram' 
    AND status IN ('pending', 'waiting_approval')
    AND deleted_at IS NULL
ORDER BY created_at DESC;

-- Аналитика по каналам за месяц
SELECT 
    channel,
    COUNT(*) as total_posts,
    COUNT(CASE WHEN status = 'published' THEN 1 END) as published,
    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
    AVG(CASE WHEN status = 'published' THEN EXTRACT(EPOCH FROM (published_at - created_at))/3600 END) as avg_hours_to_publish
FROM content_queue
WHERE created_at >= NOW() - INTERVAL '30 days' AND deleted_at IS NULL
GROUP BY channel;

-- Найти контент с ошибками для повторной обработки
SELECT id, topic, channel, error_message, retry_count 
FROM content_queue 
WHERE status IN ('failed', 'rejected') 
    AND retry_count < max_retries
    AND deleted_at IS NULL
ORDER BY last_retry_at ASC NULLS FIRST;

-- Полнотекстовый поиск по контенту
SELECT id, title, topic, channel, status
FROM content_queue
WHERE to_tsvector('russian', COALESCE(title, '') || ' ' || COALESCE(body_text, '')) @@ to_tsquery('russian', 'маркетинг & контент')
    AND deleted_at IS NULL
ORDER BY created_at DESC;