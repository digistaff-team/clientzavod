# План стандартизации UI планировщика публикаций

**Дата:** 9 апреля 2026 г.  
**Статус:** Реализован  
**Приоритет:** Средний (UI consistency)

---

## 1. Обзор проблемы

Планировщики публикаций для разных каналов (Telegram, Pinterest, Instagram, VK, YouTube, Facebook, WordPress, OK) имеют **значительные различия** в структуре, элементах управления и функциональности. Это создаёт:

- Непоследовательный пользовательский опыт
- Сложность поддержки кода
- Трудности при добавлении новых каналов
- Путаницу для пользователей при переключении между каналами

---

## 2. Текущее состояние каналов

| Канал | Планировщик | TZ | Дни недели | Лимит | Интервал | Премодерация | Модератор | Автопубликация |
|-------|------------|----|-----------|-------|----------|-------------|-----------|---------------|
| Telegram | ✅ Полный | ✅ (60+) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Pinterest | ✅ Полный | ⚠️ (17) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Instagram | ❌ Частичный | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| VK | ✅ Полный | ⚠️ (12) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| YouTube | ✅ Полный | ⚠️ (11) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Facebook | ⚠️ Другой формат | ❌ Текст | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| WordPress | ✅ Полный | ⚠️ (11) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| OK | ✅ Полный | ⚠️ (12) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Email | ❌ Нет планировщика | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| TikTok | ❌ Панель отсутствует | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| Dzen | ❌ Панель отсутствует | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

---

## 3. Критические проблемы (Must Fix)

### 3.1. Instagram — отсутствие планировщика времени

**Проблема:** Вместо стандартного выбора времени (час + минута) используется поле для ввода часов через запятую (`instagramPostingHours`). Нет выбора дней недели, лимита публикаций, интервала.

**Решение:** Заменить текущую структуру на стандартный селектор времени (dropdown часов + input минут) по аналогии с Telegram/VK.

**Затронутые файлы:**
- `public/channels.html` — секция `channelPanel-instagram`
- `public/js/channels.js` — функции `saveInstagramConfig()`, `loadInstagramConfig()`

### 3.2. Facebook — другой формат выбора времени

**Проблема:** Используется `<input type="time">` вместо стандартной пары `<select>` (часы) + `<input>` (минуты). Нет селектора часового пояса (текстовое поле вместо dropdown).

**Решение:** Заменить `<input type="time">` на пару select+input. Добавить стандартный dropdown часовых поясов.

**Затронутые файлы:**
- `public/channels.html` — секция `channelPanel-facebook`
- `public/js/channels.js` — функции `saveFacebookConfig()`, `loadFacebookConfig()`

### 3.3. Instagram — отсутствие базовых элементов планировщика

**Проблема:** Отсутствуют:
- Выбор дней недели
- Выбор часового пояса
- Поле daily limit
- Поле publish interval

**Решение:** Добавить все缺失 элементы по аналогии с Telegram.

### 3.4. Отсутствие адаптивной двухблочной структуры планировщика

**Проблема:** Все настройки каналов сейчас расположены в единой плоской grid-раскладке без логического разделения. Пользователю трудно различать, какие поля относятся к подключению/аутентификации канала, а какие — к расписанию публикаций. На мобильных устройствах всё сваливается в одну длинную вертикальную ленту без визуальной группировки.

**Требование:** Каждый канал должен иметь **два логических блока**:

| Блок 1: Настройки канала | Блок 2: Настройки периодичности |
|--------------------------|--------------------------------|
| Auth/подключение (API ключи, токены) | Время публикации (HH:MM) |
| Выбор канала/аккаунта/группы | Часовой пояс |
| Board/Page/Group ID | Daily limit |
| Board idea/focus/keywords | Publish interval |
| Channel Active | Дни недели |
| Moderator User ID | Random Publish |
| Premoderation | Auto Publish |
| Channel-specific поля | |

**Поведение на разных устройствах:**

- **Десктоп/ноутбук (ширина > 768px):** два блока располагаются **горизонтально рядом** (side-by-side, 50%/50% или 1fr 1fr)
- **Смартфон (ширина <= 768px):** два блока располагаются **вертикально друг над другом** (stacked), порядок: сначала Блок 1 (настройки канала), затем Блок 2 (периодичность)

**Затронутые файлы:**
- `public/channels.html` — перегруппировка HTML каждого канала в два блока
- `public/css/main.css` — responsive CSS с media query для двух режимов
- `public/js/channels.js` — обновление селекторов для новых структур

**Реализация:**
```css
/* Desktop: side-by-side */
.scheduler-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
}

/* Mobile: stacked */
@media (max-width: 768px) {
    .scheduler-container {
        grid-template-columns: 1fr;
        gap: 16px;
    }
    /* Блок 1 всегда идёт первым */
    .channel-settings-block { order: 1; }
    .schedule-settings-block { order: 2; }
}
```

**Визуальное оформление блоков:**
- Каждый блок имеет заголовок (H3) с иконкой
- Блок 1: `⚙️ Настройки канала`
- Блок 2: `📅 Расписание публикаций`
- Между блоками визуальный разделитель (border или background)
- Кнопки действий (Сохранить/Сгенерировать) располагаются **под обоими блоками** на всю ширину

---

## 4. Умеренные проблемы (Should Fix)

### 4.1. Нестандартное количество опций часовых поясов

| Канал | Количество TZ |
|-------|--------------|
| Telegram | 60+ |
| Pinterest | 17 |
| VK | 12 |
| YouTube | 11 |
| WordPress | 11 |
| OK | 12 |
| Facebook | 0 (текст) |

**Решение:** Создать единый HTML-шаблон с полным списком 60+ часовых поясов и использовать его во всех каналах. Возможно вынести в отдельный JS-модуль для генерации.

### 4.2. Разные реализации чекбоксов дней недели

| Канал | Реализация | IDs |
|-------|-----------|-----|
| Telegram | Individual IDs | `weekday0`...`weekday6` |
| Pinterest | Class-based | `.pinterestWeekday` |
| VK | Individual IDs | `vkWeekday0`...`vkWeekday6` |
| YouTube | Class-based | `.youtubeWeekday` |
| OK | Individual IDs | `okWeekday0`...`okWeekday6` |
| WordPress | Individual IDs | `wordpressWeekday0`...`wordpressWeekday6` |
| Facebook | Data attributes | `data-day="0"`...`data-day="6"` |
| Instagram | ❌ Отсутствуют | N/A |

**Решение:** Стандартизировать на **class-based** подходе (наиболее легко обрабатывается в JS):
```html
<label><input type="checkbox" class="channel-weekday" value="1"> Пн</label>
<label><input type="checkbox" class="channel-weekday" value="2"> Вт</label>
...
```

Где `channel` — префикс канала (telegram, pinterest, vk, etc.).

### 4.3. Отсутствующие универсальные переключатели

| Переключатель | Telegram | Pinterest | VK | YouTube | OK | FB | WP | IG |
|--------------|----------|-----------|----|---------|----|----|----|-----|
| Random Publish | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Premoderation | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

**Решение:** Добавить **только 2 переключателя** во все каналы для единообразия:
- `Random Publish` — чекбокс (включает случайное время публикации в заданном интервале)
- `Premoderation` — чекбокс (включает модерацию контента перед публикацией)

**Примечание:** 
- Чекбокс `Channel Active` **не нужен** — канал автоматически считается активным после его подключения
- Чекбокс `Auto Publish` **не нужен** — автопубликация происходит автоматически, когда отключена премодерация (`Premoderation` выключен)
- Поле `Moderator User ID` отображается **только когда включена премодерация** (условная видимость)

### 4.4. Нестандартные названия кнопок

| Канал | Кнопка сохранения | Кнопка генерации |
|-------|------------------|-----------------|
| Telegram | "Сохранить настройки" | "▶️ Сгенерировать сейчас" |
| Pinterest | "💾 Сохранить настройки" | "▶️ Сгенерировать сейчас" |
| VK | "Сохранить настройки" | "▶️ Сгенерировать сейчас" |
| YouTube | "💾 Сохранить настройки" | "▶️ Сгенерировать сейчас" |
| Facebook | "💾 Сохранить настройки" | "▶️ Сгенерировать сейчас" |
| WordPress | "💾 Сохранить настройки" | "▶️ Сгенерировать сейчас" |

**Решение:** Унифицировать на варианте **без эмодзи** для единообразия:
- Сохранение: `"Сохранить настройки"`
- Генерация: `"▶️ Сгенерировать сейчас"` (оставить эмодзи только здесь)

### 5.1. Отсутствующие панели каналов

- **TikTok** — таб есть, панель `channelPanel-tiktok` отсутствует

**Решение:** Создать базовые панели-заглушки с надписью "Скоро будет доступно" + стандартный блок планировщика (подготовка к будущей реализации).

### 5.2. Разные grid-раскладки

| Канал | Колонок |
|-------|---------|
| Telegram | 2 |
| Pinterest | 2 |
| VK | 2 |
| YouTube | 2 |
| Facebook | 3 для чекбоксов, 2 для полей |
| WordPress | 2 |

**Решение:** Привести все каналы к **2-колоночной** grid-раскладке.

### 5.3. Нестандартные IDs элементов статуса

| Канал | ID статуса |
|-------|-----------|
| Telegram | `contentSettingsStatus` |
| Pinterest | `pinterestSettingsStatus` |
| VK | `vkSettingsStatus` |
| YouTube | `youtubeSettingsStatus` |
| Facebook | `facebookSettingsStatus` |
| WordPress | `wordpressSettingsStatus` |

**Решение:** Сохранить текущий паттерн `{channel}SettingsStatus` для обратной совместимости, но добавить комментарий о стандартизации.

---

## 6. План реализации

### Фаза 1: Создание базового шаблона (Приоритет: Высокий)

**Задача 1.1:** Создать HTML-шаблон стандартного планировщика

- Создать файл `public/templates/channel-scheduler-template.html` с:
  - Выбор времени (select часов + input минут)
  - Выбор часового пояса (полный список 60+ TZ)
  - Daily limit (number input)
  - Publish interval (select)
  - Дни недели (class-based чекбоксы)
  - Random Publish (чекбокс)
  - Premoderation (чекбокс)
  - Moderator User ID (input)
  - Кнопки "Сохранить настройки" + "▶️ Сгенерировать сейчас"
  - Status line

**Задача 1.2:** Создать JS-модуль для генерации TZ dropdown

- Создать файл `public/js/timezone-helper.js`
- Функция `generateTimezoneSelect(elementId, selectedValue)` — генерирует полный список TZ
- Функция `getWeekdays(channelPrefix)` — возвращает массив выбранных дней
- Функция `setWeekdays(channelPrefix, weekdaysArray)` — устанавливает выбранные дни

**Задача 1.3:** Создать CSS-класс для стандартной раскладки

- Добавить в `public/css/main.css`:
  - `.scheduler-grid` — 2-колоночная grid
  - `.scheduler-time-select` — стили для выбора времени
  - `.scheduler-weekdays` — стили для дней недели
  - `.scheduler-controls` — стили для кнопок

### Фаза 2: Рефакторинг существующих каналов (Приоритет: Высокий)

**Задача 2.1:** Instagram — добавить полный планировщик

- Заменить `instagramPostingHours` на `instagramScheduleHour` + `instagramScheduleMinute`
- Добавить `instagramScheduleTz` dropdown
- Добавить `instagramScheduleTime` hidden field
- Добавить чекбоксы дней недели `.instagram-weekday`
- Добавить `instagramRandomPublish`, `instagramPremoderation`, `instagramModeratorUserId`
- Обновить `saveInstagramConfig()` и `loadInstagramConfig()` в `channels.js`
- Добавить функции `updateInstagramScheduleTime()`, `validateInstagramMinutes()`

**Задача 2.2:** Facebook — конвертировать в стандартный формат

- Заменить `<input type="time" id="fbScheduleTime">` на `<select id="fbScheduleHour">` + `<input id="fbScheduleMinute">`
- Заменить текстовое поле TZ на dropdown
- Конвертировать чекбоксы дней недели с `data-day` на class-based
- Добавить `fbScheduleTime` hidden field
- Обновить `saveFacebookConfig()` и `loadFacebookConfig()`
- Добавить функции `updateFacebookScheduleTime()`, `validateFacebookMinutes()`

### Фаза 3: Стандартизация TZ и дней недели (Приоритет: Средний)

**Задача 3.1:** Обновить все каналы до полного списка TZ

- Pinterest: расширить с 17 до 60+ опций
- VK: расширить с 12 до 60+ опций
- YouTube: расширить с 11 до 60+ опций
- WordPress: расширить с 11 до 60+ опций
- OK: расширить с 12 до 60+ опций

**Задача 3.2:** Конвертировать все чекбоксы дней недели в class-based формат

- Telegram: `weekday0-6` → `.telegram-weekday`
- Pinterest: `.pinterestWeekday` → `.pinterest-weekday`
- VK: `vkWeekday0-6` → `.vk-weekday`
- YouTube: `.youtubeWeekday` → `.youtube-weekday`
- OK: `okWeekday0-6` → `.ok-weekday`
- WordPress: `wordpressWeekday0-6` → `.wordpress-weekday`
- Facebook: `[data-day]` → `.facebook-weekday`
- Instagram: добавить `.instagram-weekday`

### Фаза 4: Добавление универсальных переключателей (Приоритет: Средний)

**Задача 4.1:** Добавить универсальные переключатели

Для каждого канала добавить **только 2 переключателя**:

| Канал | Добавить |
|-------|----------|
| Telegram | `Random Publish`, `Premoderation` |
| Pinterest | `Random Publish`, `Premoderation`, `Moderator User ID` |
| VK | `Random Publish`, `Premoderation` |
| YouTube | `Random Publish`, `Premoderation`, `Moderator User ID` |
| OK | `Random Publish`, `Premoderation` |
| Facebook | `Random Publish`, `Premoderation`, `Moderator User ID` |
| WordPress | `Random Publish`, `Premoderation`, `Moderator User ID` |
| Instagram | `Random Publish`, `Premoderation`, `Moderator User ID` |

**Примечание:** Поле `Moderator User ID` отображается условно — только когда чекбокс `Premoderation` включён.

**Задача 4.2:** Унифицировать кнопки

- Все кнопки сохранения: `"Сохранить настройки"` (без эмодзи)
- Все кнопки генерации: `"▶️ Сгенерировать сейчас"`

### Фаза 5: Создание панелей для каналов (Приоритет: Низкий)

**Задача 5.1:** Создать панель TikTok

- Создать `channelPanel-tiktok` в `channels.html`
- Добавить стандартный блок планировщика
- Добавить заглушку "Функционал в разработке"
- Добавить базовые функции в `channels.js`: `loadTiktokConfig()`, `saveTiktokConfig()`

### Фаза 6: Тестирование (Приоритет: Высокий)

**Задача 6.1:** Ручное тестирование

- Проверить каждый канал на корректное отображение
- Проверить сохранение настроек для каждого канала
- Проверить генерацию контента для каждого канала
- Проверить переключение между табами

**Задача 6.2:** Кросс-браузерное тестирование

- Chrome, Firefox, Safari, Edge
- Мобильные браузеры (responsive design)

**Задача 6.3:** E2E тесты

- Обновить `tests/e2e/specs/2-channels.spec.js` для проверки всех каналов
- Добавить тесты на единообразие UI элементов

---

## 7. Затронутые файлы

### Файлы для создания:
```
public/templates/channel-scheduler-template.html  (новый)
public/js/timezone-helper.js                       (новый)
documents/channel-scheduler-ui-standardization-plan.md (этот файл)
```

### Файлы для модификации:
```
public/channels.html    (HTML всех каналов)
public/js/channels.js   (JS логика всех каналов)
public/css/main.css     (CSS стили планировщика)
tests/e2e/specs/2-channels.spec.js (E2E тесты)
```

---

## 8. Критерии приёмки

- [x] Все каналы имеют **идентичную** структуру планировщика (`scheduler-container` → `channel-settings-block` + `schedule-settings-block`)
- [x] Все каналы имеют **полный** список 60+ часовых поясов (через `generateTimezoneSelect()`)
- [x] Все каналы имеют **class-based** чекбоксы дней недели (через `generateWeekdayCheckboxes()`)
- [x] Все каналы имеют **2 универсальных переключателя** (Random Publish, Premoderation)
- [x] Все каналы имеют **Moderator User ID** (условно отображается при включённой премодерации через `.moderator-field` + `.visible`)
- [x] Все каналы имеют **стандартные кнопки** ("Сохранить настройки" / "▶️ Сгенерировать сейчас")
- [x] Все каналы имеют **2-колоночную** grid-раскладку (responsive: side-by-side на десктопе, stacked на мобильном)
- [x] Созданы панели для TikTok и Dzen
- [ ] E2E тесты проходят для всех каналов (требует обновления `2-channels.spec.js`)
- [ ] Ручное тестирование подтверждает корректность

---

## 9. Риски и зависимости

| Риск | Вероятность | Влияние | Митигация |
|------|------------|---------|-----------|
| Обратная несовместимость с существующими данными | Средняя | Высокая | Миграция данных при загрузке настроек |
| Поломка существующих E2E тестов | Высокая | Средняя | Обновление селекторов в тестах |
| Backend API не поддерживает новые поля | Низкая | Высокая | Проверка `content.routes.js` перед началом |
| Сложность с Buffer API интеграцией | Средняя | Средняя | Изолированное тестирование Buffer каналов |

---

## 10. Рекомендации

1. **Начать с Instagram** — самый проблемный канал, наибольшая выгода от исправления
2. **Создать reusable компоненты** — TZ dropdown, weekday checkboxes, time picker
3. **Добавить комментарии в код** — для будущих разработчиков о стандартизации
4. **Создать документацию** — обновить QWEN.md с описанием стандартного планировщика
5. **Поэтапное развёртывание** — сначала Instagram+Facebook, потом остальные каналы

---

## 11. Дополнительные материалы

- Отчёт проверки UI: см. вывод агента от 9 апреля 2026
- Бэкенд API: `routes/content.routes.js`, `services/content/`
- Существующие CSS: `public/css/main.css`
- E2E тесты: `tests/e2e/specs/2-channels.spec.js`
