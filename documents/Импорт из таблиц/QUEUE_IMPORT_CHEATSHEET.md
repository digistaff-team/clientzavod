# 📋 Шпаргалка: Импорт в content_queue

## 🚀 Быстрый старт

### 1. Создайте CSV файл

```csv
chat_id,job_type,job_id,priority,payload_json
128247430,generate,,5,"{""reason"": ""manual""}"
128247430,generate,,5,"{""reason"": ""manual""}"
128247430,generate,,5,"{""reason"": ""manual""}"
```

### 2. Скопируйте файл в контейнер

```bash
docker cp my_import.csv bash-executor:/app/
```

### 3. Запустите импорт из контейнера

```bash
docker exec bash-executor node import_queue_from_csv.js 128247430 /app/my_import.csv
```

### 4. Проверьте результат

```bash
curl "https://clientzavod.ru/api/content/jobs?chat_id=128247430&status=queued"
```

---

## 📊 Структура CSV

| Колонка | Обяз. | Пример | Описание |
|---------|-------|--------|----------|
| `chat_id` | ✅ | `128247430` | ID пользователя |
| `job_type` | ✅ | `generate` | Тип задачи |
| `job_id` | ❌ | `1` | ID в content_jobs |
| `priority` | ❌ | `5` | Приоритет 0-100 |
| `payload_json` | ❌ | `{"reason": "manual"}` | Данные JSON |

---

## 🎯 Типы задач

| job_type | Описание | payload пример |
|----------|----------|----------------|
| `generate` | Генерация поста | `{"reason": "manual"}` |
| `publish` | Публикация | `{"jobId": 1, "reason": "approve"}` |
| `approve` | Одобрение | `{"jobId": 1}` |

---

## 🔢 Приоритеты

- `0` — по расписанию
- `5` — ручной запуск (по умолчанию)
- `10` — срочная публикация
- `>10` — системные

---

## 📁 Файлы

- `content_queue_import_template_empty.csv` — пустой шаблон
- `content_queue_import_examples.csv` — примеры
- `import_queue_from_csv.js` — скрипт импорта
- `CONTENT_QUEUE_IMPORT.md` — полная документация

---

## ⚠️ JSON в CSV

**Правильно:**
```csv
"{""reason"": ""manual""}"
```

**Неправильно:**
```csv
"{"reason": "manual"}"
{"reason": "manual"}
```

---

## 🔍 Проверка очереди

```sql
-- Все задачи
SELECT id, job_type, priority, status, created_at
FROM content_job_queue
WHERE chat_id = '128247430'
ORDER BY priority DESC, created_at;

-- Статистика
SELECT status, COUNT(*) 
FROM content_job_queue 
WHERE chat_id = '128247430'
GROUP BY status;
```

---

## 🐛 Частые ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `job_type обязателен` | Пустая колонка | Заполните `generate` или `publish` |
| `Неверный JSON` | Одинарные кавычки | Используйте `""` для экранирования |
| `chat_id mismatch` | Не совпадает ID | Укажите правильный chat_id в CSV |
| `Файл не найден` | Неверный путь | Используйте полный путь к файлу |
| `ECONNREFUSED` | PostgreSQL недоступен | Запускайте из контейнера |

---

## 💡 Советы

1. **Массовый импорт**: Создайте CSV с множеством строк для одного пользователя
2. **Отложенный запуск**: Заполните `run_at` для запуска в будущем
3. **Трассировка**: Используйте `correlation_id` для отслеживания
4. **Тестирование**: Начните с 1-2 задач перед массовым импортом
