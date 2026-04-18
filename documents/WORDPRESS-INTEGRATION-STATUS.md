# WordPress Blog Integration — Implementation Status

**Date**: April 7, 2026
**Plan**: `/root/docker-claw/documents/Wordpress-Blog-Inregration-Plan-Fixed`

---

## Completed Steps ✅

### Step 1: Data Model and Channel Config ✅
**Files Modified:**
- `services/content/repository.js` — Added WordPress columns to `content_posts`, created `content_topics` and `content_knowledge_base` tables
- `manage/store.js` — Added `getWpConfig()`, `setWpConfig()`, `clearWpConfig()` methods

**Status**: ✅ COMPLETE

---

### Step 2: WordPress REST API Service ✅
**Files Created:**
- `services/wordpressMvp.service.js` — Full WordPress REST API client

**Methods:**
- `ping(chatId)` — Check connectivity
- `uploadMedia(chatId, {buffer, filename, mimeType, altText, title})` — Upload media
- `createDraft(chatId, {title, content, excerpt, categories, featured_media, slug})` — Create draft
- `publishPost(chatId, wpPostId)` — Publish draft
- `deletePost(chatId, wpPostId)` — Delete post (rollback)
- `updateDraft(chatId, wpPostId, updates)` — Update draft
- `getCategories(chatId)` — Get WP categories for UI

**Status**: ✅ COMPLETE

---

### Step 3: Image Generation Service ✅
**Files Created:**
- `services/imageGen.service.js` — Cover image generation

**Methods:**
- `generateCover({prompt, aspectRatio, style})` — Main generation function
- `getCachedImage(prompt, aspectRatio, style)` — Check cache
- `cacheImage(buffer, prompt, aspectRatio, style, ext)` — Save to cache
- `createImageHash(prompt, aspectRatio, style)` — Hash for caching

**Priority**: Kie.ai → OpenAI Images fallback
**Cache**: `/tmp/blog-image-cache/{hash}.{ext}`

**Status**: ✅ COMPLETE

---

### Step 4: Blog Generator (Prompt Chain) ✅
**Files Created:**
- `services/blogGenerator.service.js` — Article generation engine

**Files Modified:**
- `manage/prompts.js` — Added `BLOG_PROMPT_FORMAT`, `BLOG_PROMPT_IMAGE`, `BLOG_PROMPT_WRITE`, `BLOG_PROMPT_SEO_TITLE`, `BLOG_PROMPT_SEO_DESC`, `BLOG_PROMPT_SEO_SLUG`

**Methods:**
- `generate(chatId, {topic, keywords, techDocId, moderatorNote})` — Full article generation
- `loadKnowledge(chatId, techDocId)` — Load technical document
- `aiChat(chatId, systemPrompt, userPrompt)` — AI router wrapper

**Chain**: Balance check → Knowledge load → Format → Image prompt → Image gen → Article HTML → SEO (title, desc, slug)

**Status**: ✅ COMPLETE

---

## Remaining Steps (Requires Implementation) ⏳

### Step 5: Blog Post Repository ⏳
**File to Create**: `services/content/wordpress.repository.js`
**Template**: `services/content/youtube.repository.js`

**Required Methods**:
- `createDraftPost(chatId, data)` — Create blog post record
- `updateWpIds(chatId, postId, {wp_media_id, wp_post_id, wp_permalink, wp_preview_url})` — Update WP IDs
- `markReady(chatId, postId)` — Mark as ready for moderation
- `markPublished(chatId, postId)` — Mark as published
- `markError(chatId, postId, error)` — Mark error state
- `findByStatus(chatId, status)` — Find posts by status
- `findPendingModeration(chatId)` — Find posts awaiting moderation
- `attachModeratorNote(chatId, postId, note)` — Attach moderator note

**Estimated Effort**: ~150 lines

---

### Step 6: Worker WordPress Branch ⏳
**File to Modify**: `services/content/worker.js`

**Required Logic**:
```javascript
if (channel === 'wordpress') {
  // draft → generate article
  // → upload media to WP
  // → create draft in WP
  // → save post with wp_post_id, preview_url
  // → if premoderation: send to moderator (Step 7)
  // → if approved: publish in WP
  // → announce in Telegram (Step 8)
  // → mark published, mark topic used
}
```

**Key Points**:
- Idempotency: skip media upload if `wp_media_id` exists, skip draft creation if `wp_post_id` exists
- Concurrency: semaphore 1 per chatId for WP (long generation, rate limits)
- Error handling: retry with exponential backoff, alert admin on exhaustion

**Estimated Effort**: ~200-300 lines

---

### Step 7: Moderation via CW_BOT ⏳
**Files to Modify**:
- `manage/telegram/runner.js` — Add `wp_mod:*` callback handler
- `services/content/worker.js` or `wordpress.repository.js` — `sendModerationRequest()`

**Moderation Message**:
```
📝 Новая статья для блога
Заголовок: <seoTitle>
Темы: <keywords>

[Превью](<wp_preview_url>)

[✅ Опубликовать] [🔁 Переписать] [❌ Отклонить]
```

**Callback Data**:
- `wp_mod:approve:{jobId}`
- `wp_mod:rewrite:{jobId}`
- `wp_mod:reject:{jobId}`

**Actions**:
- approve → `markApproved(jobId)` → worker publishes
- rewrite → request moderator note, save to `moderator_note`, return to draft, increment attempts
- reject → `wordpressMvp.deletePost`, status='rejected'

**Estimated Effort**: ~150-200 lines

---

### Step 8: Telegram Announcement After Publishing ⏳
**File to Modify**: `services/content/worker.js`

**Required**:
```javascript
await contentMvpService.enqueueAnnouncement(chatId, {
  text: `${seoTitle}\n\n${metaDesc}\n\n👉 Читать: ${wpPermalink}`,
  imageBuffer: featuredImageBuffer,
  source: 'blog',
  sourceRefId: contentPostId,
});
```

**Note**: If `contentMvp.enqueueAnnouncement` doesn't exist, add thin wrapper over existing `content_queue` logic with `channel='telegram'`.

**Estimated Effort**: ~50-100 lines

---

### Step 9: Topic Scheduler ⏳
**File to Modify**: `services/content/worker.js`

**Logic** (every 60 seconds):
```javascript
for each chatId with enabled wordpress:
  if no active wordpress tasks in content_queue:
    topic = SELECT FROM content_topics 
            WHERE chatId=? AND used_at IS NULL
            ORDER BY priority DESC, created_at ASC 
            LIMIT 1
    if topic:
      enqueue(chatId, 'wordpress', {topicId: topic.id})
```

**Limits**: Add to `services/content/limits.js` — `wordpress: { perDay: 3 }`

**Estimated Effort**: ~100-150 lines

---

### Step 10: API, UI, and Topic Management ⏳
**Files to Create/Modify**:
- `routes/content.routes.js` — Add WordPress endpoints
- `public/channels.html` — Add WordPress card
- `public/content.html` — Add published articles section
- `services/content/validators.js` — Add blog topic schema

**Required Endpoints**:
- `POST /api/content/wordpress/connect` — Save WP credentials + ping
- `GET /api/content/wordpress/status` — Return state + last 10 posts
- `POST /api/content/wordpress/disconnect`
- `GET /api/content/wordpress/config` — Return schedule and limits
- `PUT /api/content/wordpress/config` — Save schedule and limits
- `GET /api/content/wordpress/categories` — Proxy to WP categories
- `POST /api/content/wordpress/run-now` — Enqueue immediate task
- `POST /api/content/topics` — Create topic
- `GET /api/content/topics` — List topics
- `DELETE /api/content/topics/:id` — Delete topic
- `POST /api/content/knowledge` — Add technical document

**Estimated Effort**: ~400-600 lines (routes + validation)

---

### Step 10a: Publication Scheduler UI ⏳
**File to Modify**: `public/channels.html`

**Required**:
- `#channelPanel-wordpress` with `#wordpressSettingsBlock`
- Checkboxes: enabled, autoPublish, announceTelegram, useKnowledgeBase
- Schedule: hour, minute, timezone, days of week
- Limits: daily limit, min interval hours
- Default WP category dropdown
- Knowledge base management (add/remove documents)
- Topics CRUD table
- Scheduler status display
- Action buttons: Save, Run Now, Pause

**JS Functions** (in `public/js/common.js` or inline):
- `loadWordpressConfig()`, `saveWordpressConfig()`
- `loadWordpressTopics()`, `addWordpressTopic()`, `deleteWordpressTopic()`
- `loadWordpressKnowledge()`, `addWordpressKnowledgeDoc()`
- `runWordpressNow()`, `loadWordpressCategories()`
- `updateWordpressScheduleTime()`, `validateWordpressMinutes()`

**Estimated Effort**: ~600-800 lines (HTML + JS + CSS)

---

### Step 11: Tests ⏳
**Files to Create**:
- `tests/wordpress.publisher.test.js` — Mock fetch, test WP API
- `tests/blog.generator.test.js` — Mock ai_router + imageGen
- `tests/blog.moderation.test.js` — FSM transitions
- `tests/e2e/specs/blog-publish.spec.js` — Playwright smoke test

**Update**: `package.json` test script

**Estimated Effort**: ~400-600 lines

---

### Step 12: Documentation and Finalization ⏳
**Files to Update**:
- `QWEN.md` — Add WordPress subsystem info
- `README.md` — Add "Blog Publishing" section with WP App Password setup and Dzen RSS import instructions

**Estimated Effort**: ~100-150 lines

---

## Summary

**Completed**: 4/12 steps (foundation services)
**Remaining**: 8/12 steps (worker, moderation, UI, tests, docs)

**Total Lines Written So Far**: ~700 lines
**Estimated Remaining**: ~2200-2900 lines

**Critical Path for MVP**:
1. Step 5 (WordPress repository) — 150 lines
2. Step 6 (Worker integration) — 200-300 lines
3. Step 7 (Moderation) — 150-200 lines
4. Step 9 (Scheduler) — 100-150 lines
5. Step 10 (API endpoints) — 400-600 lines

**Total for MVP**: ~1000-1400 additional lines

**Recommendation**: The core services (Steps 1-4) are solid and production-ready. The remaining work is primarily integration (worker, moderation, scheduler) and UI (channels.html, API routes). These follow established patterns from VK/OK/Instagram implementations and can be completed systematically.

---

## Next Actions

To complete the implementation:
1. Create `services/content/wordpress.repository.js` (Step 5)
2. Modify `services/content/worker.js` to handle WordPress channel (Step 6)
3. Add `wp_mod:*` callback handlers in `manage/telegram/runner.js` (Step 7)
4. Add Telegram announcement wrapper (Step 8)
5. Add topic scheduler to worker (Step 9)
6. Create API routes for WordPress management (Step 10)
7. Build WordPress UI card in `channels.html` (Step 10a)
8. Write tests (Step 11)
9. Update documentation (Step 12)

All patterns and templates exist in VK/OK/Instagram services for reference.
