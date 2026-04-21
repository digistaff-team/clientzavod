# 📊 Шаблон импорта данных в таблицу content_queue

## 📋 Структура таблицы content_job_queue

```sql
CREATE TABLE IF NOT EXISTS content_job_queue (
  id BIGSERIAL PRIMARY KEY,
  chat_id TEXT NOT NULL,              -- ID пользователя (Telegram chat ID)
  job_type TEXT NOT NULL,             -- Тип задачи: generate, publish, approve
  job_id BIGINT,                      -- ID связанной записи в content_jobs
  priority INT NOT NULL DEFAULT 0,    -- Приоритет (выше = раньше)
  status TEXT NOT NULL DEFAULT 'queued', -- Статус: queued, processing, done, failed
  attempts INT NOT NULL DEFAULT 0,    -- Количество попыток
  max_attempts INT NOT NULL DEFAULT 5,-- Макс. попыток
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Когда запустить
  started_at TIMESTAMPTZ,             -- Когда начато выполнение
  completed_at TIMESTAMPTZ,           -- Когда завершено
  error_text TEXT,                    -- Текст ошибки
  payload JSONB,                      -- Дополнительные данные (JSON)
  correlation_id TEXT,                -- ID для трассировки
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Создано
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- Обновлено
);
```

---

## 📄 CSV-шаблон для импорта

Файл: `content_queue_import_template.csv`

### Колонки:

| Колонка | Тип | Обязательная | Описание | Пример |
|---------|-----|--------------|----------|--------|
| `chat_id` | TEXT | ✅ Да | Telegram chat ID пользователя | `128247430` |
| `job_type` | TEXT | ✅ Да | Тип задачи | `generate`, `publish`, `approve` |
| `job_id` | BIGINT | ❌ Нет | ID записи в `content_jobs` | `1`, `2`, `NULL` |
| `priority` | INT | ❌ Нет | Приоритет (0-10) | `0`, `5`, `10` |
| `status` | TEXT | ❌ Нет | Статус (по умолчанию `queued`) | `queued`, `processing` |
| `payload_json` | JSONB | ❌ Нет | Данные задачи (JSON) | `{"reason": "manual"}` |
| `correlation_id` | TEXT | ❌ Нет | ID для трассировки | `corr_manual_001` |
| `run_at` | TIMESTAMPTZ | ❌ Нет | Время запуска | `2026-03-23 12:00:00` |

---

## 🔧 Типы задач (job_type)

### 1. **generate** — Генерация контента
Создание нового поста (текст + изображение/видео)

```json
{
  "reason": "manual"
}
```

**Варианты reason:**
- `manual` — ручной запуск
- `schedule` — по расписанию
- `api` — через API
- `regen` — перегенерация

### 2. **publish** — Публикация
Публикация одобренного черновика в Telegram

```json
{
  "jobId": 1,
  "reason": "approve"
}
```

### 3. **approve** — Одобрение
(Используется редко, обычно publish)

---

## 📊 Приоритеты (priority)

| Значение | Описание | Когда использовать |
|----------|----------|-------------------|
| `0` | Обычный | Задачи по расписанию |
| `5` | Средний | Ручной запуск |
| `10` | Высокий | Срочные задачи, публикация после approve |
| `>10` | Критичный | Системные задачи |

---

## 📋 Примеры заполнения

### Пример 1: Ручная генерация поста

```csv
chat_id,job_type,job_id,priority,status,payload_json,correlation_id,run_at
128247430,generate,,5,queued,"{""reason"": ""manual""}",corr_manual_001,
```

### Пример 2: Публикация после одобрения

```csv
chat_id,job_type,job_id,priority,status,payload_json,correlation_id,run_at
128247430,publish,1,10,queued,"{""jobId"": 1, ""reason"": ""approve""}",corr_pub_001,
```

### Пример 3: Задача по расписанию

```csv
chat_id,job_type,job_id,priority,status,payload_json,correlation_id,run_at
128247430,generate,,0,queued,"{""reason"": ""schedule""}",corr_sched_001,2026-03-24 09:00:00
```

### Пример 4: Массовый импорт для нескольких пользователей

```csv
chat_id,job_type,job_id,priority,status,payload_json,correlation_id,run_at
128247430,generate,,5,queued,"{""reason"": ""manual""}",corr_001,
234008228,generate,,5,queued,"{""reason"": ""manual""}",corr_002,
399444307,generate,,5,queued,"{""reason"": ""manual""}",corr_003,
5324657153,generate,,5,queued,"{""reason"": ""manual""}",corr_004,
8092697980,generate,,5,queued,"{""reason"": ""manual""}",corr_005,
```

---

## 🛠️ Скрипт для импорта из CSV

Файл: `import_queue_from_csv.js`

```javascript
/**
 * Импорт задач в content_queue из CSV файла
 * 
 * Использование:
 *   node import_queue_from_csv.js <chatId> <file.csv>
 * 
 * Пример:
 *   node import_queue_from_csv.js 128247430 queue_import.csv
 */

const fs = require('fs');
const path = require('path');
const { enqueue, ensureQueueSchema } = require('./services/content/queue.repository');

// Парсинг CSV
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || null;
    });
    rows.push(row);
  }
  
  return rows;
}

// Парсинг одной строки CSV с учётом кавычек
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    
    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"' && inQuotes) {
      inQuotes = false;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
}

// Основной импорт
async function importQueue(chatId, filePath) {
  console.log(`📊 Импорт задач для chatId: ${chatId}`);
  console.log(`📁 Файл: ${filePath}`);
  
  // Проверяем файл
  if (!fs.existsSync(filePath)) {
    throw new Error(`Файл не найден: ${filePath}`);
  }
  
  // Парсим CSV
  const rows = parseCSV(filePath);
  console.log(`📋 Найдено строк: ${rows.length}`);
  
  // Инициализируем схему
  await ensureQueueSchema(chatId);
  
  // Импортируем
  let success = 0;
  let errors = 0;
  
  for (const row of rows) {
    try {
      // Пропускаем если chat_id не совпадает (если указан в скрипте)
      if (row.chat_id && row.chat_id !== chatId) {
        console.log(`⏭️  Пропущено: chat_id ${row.chat_id} !== ${chatId}`);
        continue;
      }
      
      // Проверяем обязательные поля
      if (!row.job_type) {
        console.error(`❌ Ошибка: job_type обязателен`);
        errors++;
        continue;
      }
      
      // Подготовка данных
      const options = {
        jobType: row.job_type,
        jobId: row.job_id ? parseInt(row.job_id, 10) : null,
        priority: row.priority ? parseInt(row.priority, 10) : 0,
        payload: row.payload_json ? JSON.parse(row.payload_json) : null,
        correlationId: row.correlation_id || null,
        runAt: row.run_at ? new Date(row.run_at) : new Date()
      };
      
      // Добавляем в очередь
      const queueId = await enqueue(chatId, options);
      console.log(`✅ Задача #${queueId}: ${row.job_type} (priority: ${options.priority})`);
      success++;
      
    } catch (e) {
      console.error(`❌ Ошибка импорта:`, e.message);
      errors++;
    }
  }
  
  console.log('\n📊 Итоги:');
  console.log(`   ✅ Успешно: ${success}`);
  console.log(`   ❌ Ошибки: ${errors}`);
  console.log(`   📋 Всего: ${rows.length}`);
  
  return { success, errors, total: rows.length };
}

// Запуск из CLI
const [,, chatId, filePath] = process.argv;

if (!chatId || !filePath) {
  console.log('Использование: node import_queue_from_csv.js <chatId> <file.csv>');
  console.log('Пример: node import_queue_from_csv.js 128247430 queue_import.csv');
  process.exit(1);
}

importQueue(chatId, path.resolve(filePath))
  .then(result => {
    console.log('\n✅ Импорт завершён!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n💥 Ошибка:', err.message);
    process.exit(1);
  });
```

---

## 🚀 Использование

### Шаг 1: Подготовьте CSV файл

```csv
chat_id,job_type,job_id,priority,status,payload_json,correlation_id,run_at
128247430,generate,,5,queued,"{""reason"": ""manual""}",corr_001,
128247430,generate,,5,queued,"{""reason"": ""manual""}",corr_002,
128247430,generate,,5,queued,"{""reason"": ""manual""}",corr_003,
```

### Шаг 2: Запустите импорт

```bash
cd /root/docker-claw
node import_queue_from_csv.js 128247430 queue_import.csv
```

### Шаг 3: Проверьте очередь

```bash
curl "https://clientzavod.ru/api/content/jobs?chat_id=128247430&status=queued&limit=10"
```

---

## ⚠️ Важные заметки

1. **JSON в CSV**: Экранируйте кавычки как `""` (двойные кавычки)
2. **Даты**: Формат `YYYY-MM-DD HH:MM:SS` или оставьте пустым для `NOW()`
3. **NULL значения**: Оставьте поле пустым
4. **chat_id**: Должен совпадать с ID пользователя в системе
5. **job_id**: Должен ссылаться на существующую запись в `content_jobs` (для publish)

---

## 🔍 Проверка очереди

```sql
-- Посмотреть все задачи в очереди
SELECT id, job_type, job_id, priority, status, payload, created_at
FROM content_job_queue
WHERE chat_id = '128247430'
ORDER BY priority DESC, created_at ASC;

-- Посмотреть статистику
SELECT status, COUNT(*) as count
FROM content_job_queue
WHERE chat_id = '128247430'
GROUP BY status;
```

---

## 📄 Файлы

- `content_queue_import_template.csv` — пустой шаблон
- `import_queue_from_csv.js` — скрипт импорта
- `CONTENT_QUEUE_IMPORT.md` — эта документация
