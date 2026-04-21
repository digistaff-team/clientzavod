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

/**
 * Парсинг CSV с учётом кавычек и экранирования
 */
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

/**
 * Парсинг одной строки CSV с учётом кавычек
 */
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

/**
 * Основной импорт
 */
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
  const skippedRows = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 because header is row 1
    
    try {
      // Пропускаем если chat_id не совпадает (если указан в скрипте)
      if (row.chat_id && row.chat_id !== chatId) {
        console.log(`⏭️  Строка ${rowNum}: Пропущено (chat_id ${row.chat_id} !== ${chatId})`);
        skippedRows.push({ row: rowNum, reason: 'chat_id mismatch' });
        continue;
      }
      
      // Проверяем обязательные поля
      if (!row.job_type) {
        console.error(`❌ Строка ${rowNum}: job_type обязателен`);
        errors++;
        continue;
      }
      
      // Валидация job_type
      const validJobTypes = ['generate', 'publish', 'approve'];
      if (!validJobTypes.includes(row.job_type)) {
        console.error(`❌ Строка ${rowNum}: Недопустимый job_type "${row.job_type}". Допустимые: ${validJobTypes.join(', ')}`);
        errors++;
        continue;
      }
      
      // Валидация priority
      let priority = 0;
      if (row.priority) {
        priority = parseInt(row.priority, 10);
        if (isNaN(priority) || priority < 0 || priority > 100) {
          console.warn(`⚠️  Строка ${rowNum}: priority должен быть 0-100, использовано 0`);
          priority = 0;
        }
      }
      
      // Валидация payload_json
      let payload = null;
      if (row.payload_json) {
        try {
          payload = JSON.parse(row.payload_json);
        } catch (e) {
          console.error(`❌ Строка ${rowNum}: Неверный JSON в payload_json: ${e.message}`);
          errors++;
          continue;
        }
      }
      
      // Валидация run_at
      let runAt = new Date();
      if (row.run_at && row.run_at.trim()) {
        runAt = new Date(row.run_at.trim());
        if (isNaN(runAt.getTime())) {
          console.warn(`⚠️  Строка ${rowNum}: Неверная дата "${row.run_at}", использовано NOW()`);
          runAt = new Date();
        }
      }
      
      // Подготовка данных
      const options = {
        jobType: row.job_type,
        jobId: row.job_id && row.job_id.trim() ? parseInt(row.job_id.trim(), 10) : null,
        priority: priority,
        payload: payload,
        correlationId: row.correlation_id && row.correlation_id.trim() ? row.correlation_id.trim() : null,
        runAt: runAt
      };
      
      // Добавляем в очередь
      const queueId = await enqueue(chatId, options);
      console.log(`✅ Строка ${rowNum}: Задача #${queueId} — ${row.job_type} (priority: ${priority}, jobId: ${options.jobId || 'null'})`);
      success++;
      
    } catch (e) {
      console.error(`❌ Строка ${rowNum}: Ошибка импорта: ${e.message}`);
      errors++;
    }
  }
  
  // Итоговый отчёт
  console.log('\n' + '='.repeat(60));
  console.log('📊 ИТОГИ ИМПОРТА');
  console.log('='.repeat(60));
  console.log(`   ✅ Успешно: ${success}`);
  console.log(`   ❌ Ошибки: ${errors}`);
  console.log(`   ⏭️  Пропущено: ${skippedRows.length}`);
  console.log(`   📋 Всего строк: ${rows.length}`);
  console.log('='.repeat(60));
  
  if (errors > 0) {
    console.log('\n⚠️  Были ошибки при импорте. Проверьте лог выше.');
  }
  
  return { success, errors, skipped: skippedRows.length, total: rows.length };
}

// Запуск из CLI
const [,, chatId, filePath] = process.argv;

if (!chatId || !filePath) {
  console.log('📋 Импорт задач в content_queue из CSV\n');
  console.log('Использование: node import_queue_from_csv.js <chatId> <file.csv>\n');
  console.log('Примеры:');
  console.log('  node import_queue_from_csv.js 128247430 queue_import.csv');
  console.log('  node import_queue_from_csv.js 234008228 ./imports/tasks.csv\n');
  console.log('Формат CSV:');
  console.log('  chat_id,job_type,job_id,priority,status,payload_json,correlation_id,run_at');
  console.log('  128247430,generate,,5,queued,"{""reason"": ""manual""}",corr_001,');
  process.exit(1);
}

importQueue(chatId, path.resolve(filePath))
  .then(result => {
    console.log('\n✅ Импорт завершён!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n💥 Критическая ошибка:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
