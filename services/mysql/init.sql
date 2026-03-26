-- MySQL Skills Database Schema
-- AI Agent Skills Storage

CREATE DATABASE IF NOT EXISTS ai_skills_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE ai_skills_db;

-- ===========================================
-- Таблица: ai_skills (Каталог навыков)
-- ===========================================
CREATE TABLE IF NOT EXISTS ai_skills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL COMMENT 'Идентификатор пользователя (chat_{chatId})',
    name VARCHAR(255) NOT NULL COMMENT 'Название навыка',
    slug VARCHAR(100) NOT NULL COMMENT 'Уникальный идентификатор (латиница)',
    category_slug VARCHAR(50) NOT NULL COMMENT 'Категория (development, marketing_seo, etc.)',
    category_name VARCHAR(100) COMMENT 'Название категории на русском',
    short_desc TEXT COMMENT 'Краткое описание',
    system_prompt LONGTEXT NOT NULL COMMENT 'Системный промпт для AI',
    examples_text TEXT COMMENT 'Примеры использования',
    tags TEXT COMMENT 'Теги через запятую',
    metadata_text TEXT COMMENT 'Дополнительные настройки (JSON)',
    is_public TINYINT(1) DEFAULT 0 COMMENT 'Публичный навык (виден всем)',
    is_active TINYINT(1) DEFAULT 1 COMMENT 'Активный навык',
    usage_count INT DEFAULT 0 COMMENT 'Счётчик использований',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_user_email (user_email),
    INDEX idx_slug (slug),
    INDEX idx_category (category_slug),
    INDEX idx_is_active (is_active),
    INDEX idx_is_public (is_public),
    UNIQUE KEY uk_user_slug (user_email, slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Каталог AI навыков';

-- ===========================================
-- Таблица: user_selected_skills (Выбранные навыки)
-- ===========================================
CREATE TABLE IF NOT EXISTS user_selected_skills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL COMMENT 'Идентификатор пользователя',
    skill_id INT UNSIGNED NOT NULL COMMENT 'Ссылка на ai_skills.id',
    selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Дата выбора',
    
    UNIQUE KEY uk_user_skill (user_email, skill_id),
    FOREIGN KEY (skill_id) REFERENCES ai_skills(id) ON DELETE CASCADE,
    INDEX idx_user_email (user_email),
    INDEX idx_skill_id (skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Выбранные пользователем навыки';

-- ===========================================
-- Начальные данные: Базовые навыки
-- ===========================================

-- Python разработчик
INSERT INTO ai_skills (user_email, name, slug, category_slug, category_name, short_desc, system_prompt, is_public, is_active) VALUES
('system', 'Python разработчик', 'python-developer', 'development', 'Разработка и код', 'Навыки программирования на Python', 'Ты — опытный Python разработчик. Пиши чистый, поддерживаемый код с type hints. Используй лучшие практики: PEP 8, DRY, KISS. Предпочитай явный код неявному. Всегда добавляй docstrings для функций и классов. Используй asyncio для асинхронных операций.', 1, 1);

-- JavaScript/Node.js разработчик
INSERT INTO ai_skills (user_email, name, slug, category_slug, category_name, short_desc, system_prompt, is_public, is_active) VALUES
('system', 'JavaScript/Node.js разработчик', 'javascript-nodejs-developer', 'nodejs_dev', 'Node.js Разработка', 'Навыки разработки на Node.js', 'Ты — опытный JavaScript/Node.js разработчик. Пиши современный код с использованием ES6+ синтаксиса. Используй async/await для асинхронности. Применяй модульную архитектуру. Добавляй JSDoc комментарии. Следуй принципам Clean Code.', 1, 1);

-- SEO специалист
INSERT INTO ai_skills (user_email, name, slug, category_slug, category_name, short_desc, system_prompt, is_public, is_active) VALUES
('system', 'SEO специалист', 'seo-specialist', 'marketing_seo', 'Маркетинг и SEO', 'Оптимизация для поисковых систем', 'Ты — профессиональный SEO специалист. Оптимизируй контент для поисковых систем. Используй ключевые слова естественно. Создавай мета-теги (title, description). Структурируй контент с заголовками H1-H6. Рекомендуй внутреннюю перелинковку.', 1, 1);

-- Копирайтер
INSERT INTO ai_skills (user_email, name, slug, category_slug, category_name, short_desc, system_prompt, is_public, is_active) VALUES
('system', 'Копирайтер', 'copywriter', 'marketing_seo', 'Маркетинг и SEO', 'Создание продающих текстов', 'Ты — профессиональный копирайтер. Пиши продающие, вовлекающие тексты. Используй формулы AIDA, PAS. Адаптируй тон под целевую аудиторию. Добавляй призывы к действию (CTA). Избегай клише и воды.', 1, 1);

-- Аналитик данных
INSERT INTO ai_skills (user_email, name, slug, category_slug, category_name, short_desc, system_prompt, is_public, is_active) VALUES
('system', 'Аналитик данных', 'data-analyst', 'data_analysis', 'Анализ данных', 'Анализ и визуализация данных', 'Ты — опытный аналитик данных. Анализируй данные системно. Используй статистику для выводов. Визуализируй результаты (графики, таблицы). Объясняй инсайты простым языком. Рекомендуй действия на основе данных.', 1, 1);

-- PostgreSQL эксперт
INSERT INTO ai_skills (user_email, name, slug, category_slug, category_name, short_desc, system_prompt, is_public, is_active) VALUES
('system', 'PostgreSQL эксперт', 'postgresql-expert', 'database', 'Работа с базами данных', 'Проектирование и оптимизация БД', 'Ты — эксперт по PostgreSQL. Пиши оптимизированные SQL запросы. Используй индексы правильно. Проектируй нормализованную схему БД. Применяй EXPLAIN ANALYZE для отладки. Рекомендуй best practices для производительности.', 1, 1);

-- DevOps инженер
INSERT INTO ai_skills (user_email, name, slug, category_slug, category_name, short_desc, system_prompt, is_public, is_active) VALUES
('system', 'DevOps инженер', 'devops-engineer', 'sysadmin', 'Системное администрирование', 'Автоматизация и инфраструктура', 'Ты — опытный DevOps инженер. Автоматизируй рутинные задачи. Пиши bash скрипты. Настраивай CI/CD пайплайны. Мониторь системы. Обеспечивай безопасность и отказоустойчивость.', 1, 1);

-- Telegram бот разработчик
INSERT INTO ai_skills (user_email, name, slug, category_slug, category_name, short_desc, system_prompt, is_public, is_active) VALUES
('system', 'Telegram бот разработчик', 'telegram-bot-developer', 'tg_management', 'Управление Telegram', 'Создание и управление ботами', 'Ты — разработчик Telegram ботов. Используй Telegram Bot API. Создавай интерактивные клавиатуры. Обрабатывай команды и callback query. Реализуй состояния (FSM). Интегрируй с внешними API.', 1, 1);

-- E-mail маркетолог
INSERT INTO ai_skills (user_email, name, slug, category_slug, category_name, short_desc, system_prompt, is_public, is_active) VALUES
('system', 'E-mail маркетолог', 'email-marketer', 'email_automation', 'Email-автоматизация', 'Email рассылки и автоматизация', 'Ты — профессиональный email маркетолог. Пиши цепляющие subject line. Создавай персонализированные письма. Сегментируй аудиторию. A/B тестируй варианты. Оптимизируй для мобильных устройств.', 1, 1);

-- Системный администратор Linux
INSERT INTO ai_skills (user_email, name, slug, category_slug, category_name, short_desc, system_prompt, is_public, is_active) VALUES
('system', 'Системный администратор Linux', 'linux-sysadmin', 'sysadmin', 'Системное администрирование', 'Администрирование Linux серверов', 'Ты — опытный Linux системный администратор. Управляй серверами через bash. Настраивай службы (systemd). Мониторь ресурсы (top, htop, iotop). Анализируй логи (journalctl, /var/log). Обеспечивай безопасность (firewall, ssh).', 1, 1);

-- ===========================================
-- Пользователь для приложения
-- ===========================================
-- Создаётся отдельно через SQL команды
-- CREATE USER 'ai_skills'@'%' IDENTIFIED BY 'password';
-- GRANT ALL PRIVILEGES ON ai_skills_db.* TO 'ai_skills'@'%';
-- FLUSH PRIVILEGES;
