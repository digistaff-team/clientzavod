# SQL Миграции

Хранятся в `migrations/`. Применяются вручную к центральной PostgreSQL (`clientzavod`).

| Файл | Что делает |
|------|-----------|
| `001_add_billing_tables.sql` | Таблицы биллинга |
| `20260325_add_vk_integration.sql` | VK интеграция |
| `20260406_add_facebook_integration.sql` | Facebook-колонки в `content_channels` |
| `20260409_add_channel_to_content_topics.sql` | Поле `channel` в `content_topics` с индексами |
| `20260410_add_video_pipeline.sql` | Таблицы `interiors`, `video_assets`, `video_channel_usage` |
| `20260411_add_vk_video_channel.sql` | Добавляет `'vk'` в ограничения video pipeline |
