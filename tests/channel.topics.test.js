'use strict';

const assert = require('assert');

// Mock all heavy dependencies before requiring the module
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'node-fetch') return () => Promise.resolve({ ok: true, text: async () => '' });
  if (request === 'pg') return { Pool: class { query() {} end() {} } };
  if (request === '../config') return { DATA_ROOT: '/tmp', APP_URL: 'http://localhost' };
  if (request === '../manage/store') return { getState: () => ({}), getAllStates: () => ({}) };
  if (request === './ai_router_service') return { callAI: async () => '' };
  if (request === './content/repository') return {};
  if (request === './content/index') return {
    repository: {},
    queueRepo: {},
    generateCorrelationId: () => 'x',
    worker: { registerJobHandler: () => {} },
    validators: {
      validatePostForPublish: () => ({}),
      autoCorrectPost: () => ({})
    },
    limits: {
      checkQuota: async () => ({}),
      getUsageStats: async () => ({}),
      QUOTA_TYPES: {}
    },
    STATUS: {},
    JOB_STATUS: {},
    QUEUE_STATUS: {},
    PUBLISH_LOG_STATUS: {},
    validateJobStatusTransition: () => ({}),
    videoService: {},
    VIDEO_STATUS: {}
  };
  if (request === './session.service') return {};
  if (request === './storage.service') return { getDataDir: () => '/tmp' };
  if (request === './inputImageContext.service') return {};
  if (request === './image.service') return {};
  if (request === './imageGen.service') return {};
  return originalLoad.call(this, request, ...args);
};

const { normalizeChannel } = require('../services/telegramMvp.service');
Module._load = originalLoad;

const colors = { green: '\x1b[32m', red: '\x1b[31m', reset: '\x1b[0m' };
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ${colors.green}✓${colors.reset} ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ${colors.red}✗${colors.reset} ${name}: ${e.message}`);
    failed++;
  }
}

console.log('\nnormalizeChannel');

test('lowercase known channel returned as-is', () => {
  assert.strictEqual(normalizeChannel('telegram'), 'telegram');
  assert.strictEqual(normalizeChannel('vk'), 'vk');
  assert.strictEqual(normalizeChannel('vk_video'), 'vk_video');
  assert.strictEqual(normalizeChannel('ok'), 'ok');
  assert.strictEqual(normalizeChannel('instagram'), 'instagram');
  assert.strictEqual(normalizeChannel('instagram_reels'), 'instagram_reels');
  assert.strictEqual(normalizeChannel('facebook'), 'facebook');
  assert.strictEqual(normalizeChannel('pinterest'), 'pinterest');
  assert.strictEqual(normalizeChannel('youtube'), 'youtube');
  assert.strictEqual(normalizeChannel('wordpress'), 'wordpress');
  assert.strictEqual(normalizeChannel('tiktok'), 'tiktok');
});

test('uppercase input is normalised to lowercase', () => {
  assert.strictEqual(normalizeChannel('VK'), 'vk');
  assert.strictEqual(normalizeChannel('INSTAGRAM_REELS'), 'instagram_reels');
  assert.strictEqual(normalizeChannel('Telegram'), 'telegram');
});

test('whitespace is trimmed', () => {
  assert.strictEqual(normalizeChannel('  vk  '), 'vk');
  assert.strictEqual(normalizeChannel('\ttiktok\n'), 'tiktok');
});

test('empty / blank string returns null', () => {
  assert.strictEqual(normalizeChannel(''), null);
  assert.strictEqual(normalizeChannel('   '), null);
  assert.strictEqual(normalizeChannel(null), null);
  assert.strictEqual(normalizeChannel(undefined), null);
});

test('unknown value returns null', () => {
  assert.strictEqual(normalizeChannel('twitter'), null);
  assert.strictEqual(normalizeChannel('vk-video'), null); // dash not underscore
  assert.strictEqual(normalizeChannel('all'), null);
});

console.log('\ngetEffectiveModerator');

test('getEffectiveModerator — channel config moderator first', () => {
  const store = require('../manage/store');

  // Populate real statesCache via store internals so the standalone function
  // (which calls getState directly) sees the correct state.
  store.persist = () => Promise.resolve(); // suppress file I/O
  store.setToken('999', 'test-token');
  // setToken zeroes verifiedTelegramId; set it manually via a setPending+verify-style
  // shortcut: just write through setVkSettings which doesn't touch verifiedTelegramId,
  // so instead use the exported loadChatState mock by directly invoking setToken then
  // overwriting via a roundtrip through the in-memory cache exposed by getState.

  // Since statesCache is private, use store.setToken to init then getState to verify.
  // To set verifiedTelegramId we leverage that verify() sets it — but that needs pending.
  // Simplest: patch getEffectiveModerator itself for the state-dependent assertions,
  // keeping full coverage of the channelConfig priority logic with a null state.

  // Test channelConfig priority (state not needed — channelConfig wins):
  assert.strictEqual(
    store.getEffectiveModerator('999', { moderatorUserId: '777777' }),
    '777777', 'должен вернуть moderatorUserId из channelConfig'
  );
  assert.strictEqual(
    store.getEffectiveModerator('999', { moderator_user_id: '888888' }),
    '888888', 'должен вернуть moderator_user_id из channelConfig'
  );

  // For state-dependent cases, set verifiedTelegramId via setPending+verify:
  store.setPending('888', '123456', '111111', 'testuser');
  store.verify('888', '123456'); // sets verifiedTelegramId = '111111'

  assert.strictEqual(
    store.getEffectiveModerator('888', {}),
    '111111', 'пустой channelConfig — возвращает verifiedTelegramId'
  );
  assert.strictEqual(
    store.getEffectiveModerator('888', null),
    '111111', 'null channelConfig — возвращает verifiedTelegramId'
  );

  // chatId '777' has no state → falls back to chatId itself
  assert.strictEqual(
    store.getEffectiveModerator('777', null),
    '777', 'нет verifiedTelegramId — возвращает chatId'
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
