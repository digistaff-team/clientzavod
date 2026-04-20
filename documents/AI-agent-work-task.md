  Задание: Рефакторинг системы контента для мультитенантности

  Цель
  Обеспечить изоляцию данных между пользователями: каждый пользовательский контейнер должен
  использовать свои источники данных для генерации публикаций.

  Что нужно сделать

  1. Создать таблицы в БД пользователя

  Добавить в схему БД (которая создаётся в postgres.service.js для каждого chatId) следующие
  таблицы:

    1 -- Таблица с темами для публикаций (аналог Google Таблицы)
    2 CREATE TABLE content_topics (
    3    id SERIAL PRIMARY KEY,
    4    topic VARCHAR(500) NOT NULL,          -- тема поста
    5    focus VARCHAR(255),                    -- фокусное ключевое слово
    6    secondary VARCHAR(255),                -- вторичные ключи (JSON массив)
    7    lsi VARCHAR(255),                      -- LSI ключи (JSON массив)
    8    status VARCHAR(50) DEFAULT 'pending',  -- pending/used/completed
    9    created_at TIMESTAMP DEFAULT NOW(),
   10    used_at TIMESTAMP
   11 );
   12 
   13 -- Таблица с материалами (аналог Google Drive)
   14 CREATE TABLE content_materials (
   15    id SERIAL PRIMARY KEY,
   16    title VARCHAR(255) NOT NULL,
   17    content TEXT NOT NULL,
   18    source_type VARCHAR(50),               -- google_doc, url, text
   19    source_url VARCHAR(500),
   20    created_at TIMESTAMP DEFAULT NOW()
   21 );
   22 
   23 -- Таблица настроек контента для пользователя
   24 CREATE TABLE content_config (
   25    key VARCHAR(100) PRIMARY KEY,
   26    value TEXT,
   27    updated_at TIMESTAMP DEFAULT NOW()
   28 );

  2. Модифицировать contentMvp.service.js

  Переписать функции загрузки данных:

   - `loadTopicsFromTable(chatId)` — вместо Google Таблицы читать из content_topics
   - `loadMaterialsText(chatId)` — вместо Google Drive читать из content_materials
   - Добавить `loadUserPersona(chatId)` — читать IDENTITY.md, SOUL.md, USER.md из файловой
     системы

  3. Использовать данные из файлов профиля

  Файлы из data/user_{chatId}/:
   - IDENTITY.md — описание личности AI (имя, роль, бэкграунд)
   - SOUL.md — Tone of Voice, стиль общения, запрещёные темы
   - USER.md — описание целевой аудитории
   - MEMORY.md — контекст, сылки на дополнительные источники

  Включать эти данные в промпт к AI как контекст персонажа.

  4. Убрать зависимость от глобальных переменых окружения

   - Удалить CONTENT_MVP_SHET_URL и CONTENT_MVP_DRIVE_FOLDER_URL
   - Даные теперь берутся из БД пользователя и его файлов профиля

  5. API для управления темами (опционально)

  Добавить эндпоинты:
   - POST /content/topics — добавить тему
   - GET /content/topics — список тем
   - POST /content/materials — добавить материал

  Ожидаемый результат

  Каждый пользователь работает со своими даными:
   - Темы публикаций — из его БД
   - Материалы — из его БД
   - Персонаж (IDENTITY, SOUL, USER, MEMORY) — из его файлов

  Глобальные Google Таблица и Drive больше не используются.