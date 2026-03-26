# Миграция MySQL базы навыков на локальный сервер

Этот документ описывает процесс переноса базы данных навыков AI с внешнего сервера (`ai.memory.api.atiks.org`) на ваш локальный сервер.

## 📋 Что было изменено

### Новые файлы:
- `services/mysql.service.js` - Сервис для работы с MySQL (пул подключений, CRUD операции)
- `services/mysql/init.sql` - SQL схема базы данных с начальными данными

### Обновлённые файлы:
- `config.js` - Добавлена конфигурация MySQL
- `.env.example` - Добавлены переменные для MySQL
- `docker-compose.yml` - Добавлен сервис MySQL
- `manage/context.js` - Использует локальный mysql.service.js вместо внешнего API
- `manage/routes.js` - Добавлен endpoint `/api/manage/mysql/query` для клиентских запросов
- `public/js/skills.js` - Использует локальный API вместо внешнего
- `public/js/ai.js` - Использует локальный API вместо внешнего

---

## 🚀 Установка и настройка

### Шаг 1: Обновите .env файл

Скопируйте переменные из `.env.example` в ваш `.env` файл:

```bash
# MySQL (Skills Database)
MYSQL_SKILLS_HOST=mysql
MYSQL_SKILLS_PORT=3306
MYSQL_SKILLS_USER=ai_skills
MYSQL_SKILLS_PASSWORD=your_secure_password_here
MYSQL_SKILLS_DATABASE=ai_skills_db

# Пароль root для MySQL (для Docker Compose)
MYSQL_ROOT_PASSWORD=your_root_password_here
```

**⚠️ Важно:** Замените `your_secure_password_here` и `your_root_password_here` на надёжные пароли!

### Шаг 2: Запустите MySQL контейнер

```bash
docker-compose up -d mysql
```

Проверьте статус:
```bash
docker-compose ps mysql
```

### Шаг 3: Проверьте инициализацию базы данных

При первом запуске контейнер автоматически:
1. Создаст базу данных `ai_skills_db`
2. Создаст таблицы `ai_skills` и `user_selected_skills`
3. Добавит 10 базовых навыков

Проверьте логи:
```bash
docker-compose logs mysql
```

### Шаг 4: Перезапустите приложение

```bash
docker-compose restart app
```

---

## 🔧 Проверка работы

### 1. Проверка подключения к MySQL

```bash
# Подключитесь к MySQL контейнеру
docker exec -it mysql-skills mysql -u ai_skills -p

# Введите пароль из .env файла
# Затем выполните:
USE ai_skills_db;
SHOW TABLES;
SELECT * FROM ai_skills LIMIT 5;
```

### 2. Проверка API

Откройте в браузере или через curl:
```bash
curl http://localhost:3015/api/manage/ai/skills?chat_id=your_chat_id
```

### 3. Проверка веб-интерфейса

1. Откройте `/skills.html` в вашем браузере
2. Проверьте, что навыки загружаются
3. Попробуйте выбрать навык
4. Проверьте, что выбор сохраняется

---

## 📊 Структура базы данных

### Таблица `ai_skills`

| Поле | Тип | Описание |
|------|-----|----------|
| id | INT | Primary key |
| user_email | VARCHAR(255) | Идентификатор пользователя (chat_{chatId}) |
| name | VARCHAR(255) | Название навыка |
| slug | VARCHAR(100) | Уникальный slug |
| category_slug | VARCHAR(50) | Категория |
| category_name | VARCHAR(100) | Название категории |
| short_desc | TEXT | Краткое описание |
| system_prompt | LONGTEXT | Системный промпт |
| examples_text | TEXT | Примеры |
| tags | TEXT | Теги |
| metadata_text | TEXT | Метаданные (JSON) |
| is_public | TINYINT(1) | Публичный навык |
| is_active | TINYINT(1) | Активный навык |
| usage_count | INT | Счётчик использований |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

### Таблица `user_selected_skills`

| Поле | Тип | Описание |
|------|-----|----------|
| id | INT | Primary key |
| user_email | VARCHAR(255) | Идентификатор пользователя |
| skill_id | INT | Foreign key на ai_skills.id |
| selected_at | TIMESTAMP | Дата выбора |

---

## 🔄 Миграция данных с внешнего сервера

Если у вас есть данные на внешнем сервере, выполните следующие шаги:

### 1. Экспорт данных со старого сервера

```bash
# На старом сервере (если есть доступ к MySQL)
mysqldump -u root -p ai_skills_db > skills_backup.sql
```

Или через API (если есть доступ):
```bash
curl -X POST https://ai.memory.api.atiks.org/mysql_full_proxy_api \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM ai_skills WHERE user_email = %s", "params": ["your_email"]}' \
  > skills_export.json
```

### 2. Импорт данных в новую базу

```bash
# Подключитесь к новой базе
docker exec -i mysql-skills mysql -u root -pYOUR_ROOT_PASSWORD ai_skills_db < skills_backup.sql
```

Или через SQL:
```bash
docker exec -it mysql-skills mysql -u ai_skills -p

USE ai_skills_db;

# Вставьте данные из экспорта
-- INSERT INTO ai_skills (...) VALUES (...);
```

---

## 🛠️ Управление навыками через SQL

### Добавить новый навык

```sql
INSERT INTO ai_skills (
    user_email, name, slug, category_slug, category_name,
    short_desc, system_prompt, is_public, is_active
) VALUES (
    'chat_123456789',
    'Мой кастомный навык',
    'my-custom-skill',
    'development',
    'Разработка',
    'Описание навыка',
    'Ты - эксперт по...',
    1,
    1
);
```

### Выбрать навык пользователем

```sql
INSERT INTO user_selected_skills (user_email, skill_id)
VALUES ('chat_123456789', 1);
```

### Получить все выбранные навыки пользователя

```sql
SELECT s.* FROM ai_skills s
INNER JOIN user_selected_skills us ON s.id = us.skill_id
WHERE us.user_email = 'chat_123456789' AND s.is_active = 1;
```

### Удалить навык

```sql
DELETE FROM ai_skills WHERE id = 123 AND user_email = 'chat_123456789';
```

---

## 🔐 Безопасность

### Рекомендации по паролям

1. Используйте надёжные пароли (минимум 16 символов)
2. Храните пароли в `.env` файле с правами `600`
3. Не коммитьте `.env` файл в git

```bash
chmod 600 .env
```

### Ограничение доступа к MySQL

По умолчанию MySQL слушает только на `127.0.0.1:3306`. Для доступа извне:

1. Откройте порт в firewall
2. Создайте пользователя с ограниченным доступом
3. Используйте SSL подключение

---

## 🐛 Решение проблем

### Ошибка подключения к MySQL

```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**Решение:**
```bash
# Проверьте, запущен ли контейнер
docker-compose ps mysql

# Проверьте логи
docker-compose logs mysql

# Перезапустите контейнер
docker-compose restart mysql
```

### Ошибка аутентификации

```
Error: Access denied for user 'ai_skills'@'localhost'
```

**Решение:**
1. Проверьте пароль в `.env`
2. Пересоздайте контейнер:
```bash
docker-compose down mysql
docker volume rm docker-claw_mysql_data
docker-compose up -d mysql
```

### Навыки не загружаются в веб-интерфейсе

**Решение:**
1. Проверьте консоль браузера на ошибки
2. Проверьте логи приложения:
```bash
docker-compose logs app | grep MYSQL
```

---

## 📈 Мониторинг

### Статистика по навыкам

```sql
-- Количество навыков по категориям
SELECT category_name, COUNT(*) as count
FROM ai_skills
WHERE is_active = 1
GROUP BY category_name;

-- Топ популярных навыков
SELECT name, usage_count
FROM ai_skills
WHERE is_active = 1
ORDER BY usage_count DESC
LIMIT 10;

-- Количество пользователей с выбранными навыками
SELECT COUNT(DISTINCT user_email) as users_count
FROM user_selected_skills;
```

### Очистка старых данных

```sql
-- Удалить неиспользуемые навыки (старше 30 дней)
DELETE FROM ai_skills
WHERE is_public = 0
  AND user_email != 'system'
  AND usage_count = 0
  AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

---

## 📚 API Reference

### POST /api/manage/mysql/query

Выполняет SQL запрос к базе навыков.

**Request:**
```json
{
  "sql": "SELECT * FROM ai_skills WHERE is_active = 1",
  "params": []
}
```

**Response:**
```json
{
  "data": [...],
  "insert_id": 123
}
```

### GET /api/manage/ai/skills

Получить выбранные навыки пользователя.

**Request:**
```
?chat_id=123456789
```

**Response:**
```json
{
  "skills": [
    {
      "id": 1,
      "name": "Python разработчик",
      "system_prompt": "Ты - опытный Python разработчик...",
      ...
    }
  ]
}
```

---

## 🆘 Поддержка

При возникновении проблем:

1. Проверьте логи MySQL: `docker-compose logs mysql`
2. Проверьте логи приложения: `docker-compose logs app`
3. Убедитесь, что переменные окружения настроены правильно
4. Проверьте, что таблицы созданы: `docker exec -it mysql-skills mysql -u ai_skills -p -e "SHOW TABLES;"`
