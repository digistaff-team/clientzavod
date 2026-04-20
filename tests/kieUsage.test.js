/**
 * Tests for kieUsage.repository.js
 */
const assert = require('assert');

// Mock per-user DB client
let mockCallCount = 0;
const mockClient = {
  query: async (sql, params) => {
    if (sql.includes('CREATE TABLE')) return { rows: [] };
    if (sql.includes('INSERT INTO kie_daily_usage')) {
      mockCallCount++;
      return { rows: [{ call_count: mockCallCount }] };
    }
    if (sql.includes('UPDATE') && sql.includes('GREATEST')) {
      mockCallCount = Math.max(0, mockCallCount - 1);
      return { rows: [] };
    }
    if (sql.includes('SELECT')) {
      return { rows: [{ call_count: mockCallCount }] };
    }
    return { rows: [] };
  }
};

// Mock repository.withClient
require.cache[require.resolve('../services/content/repository')] = {
  id: require.resolve('../services/content/repository'),
  filename: require.resolve('../services/content/repository'),
  loaded: true,
  exports: {
    withClient: async (chatId, fn) => fn(mockClient)
  }
};

const kieUsage = require('../services/content/kieUsage.repository');

async function testIncrementAndGet() {
  console.log('Test: increment and get KIE call count');
  mockCallCount = 0;

  const count1 = await kieUsage.incrementAndGetKieCallCount('testChat');
  assert.strictEqual(count1, 1, 'First increment should return 1');

  const count2 = await kieUsage.incrementAndGetKieCallCount('testChat');
  assert.strictEqual(count2, 2, 'Second increment should return 2');

  const current = await kieUsage.getKieCallCount('testChat');
  assert.strictEqual(current, 2, 'getKieCallCount should return 2');

  console.log('✓ increment and get passed\n');
}

async function testDecrement() {
  console.log('Test: decrement KIE call count');
  mockCallCount = 5;

  await kieUsage.decrementKieCallCount('testChat');
  const current = await kieUsage.getKieCallCount('testChat');
  assert.strictEqual(current, 4, 'After decrement should be 4');

  console.log('✓ decrement passed\n');
}

async function testEnsureSchemaIsIdempotent() {
  console.log('Test: ensureKieUsageSchema is idempotent (no throw)');
  await kieUsage.ensureKieUsageSchema('testChat');
  await kieUsage.ensureKieUsageSchema('testChat');
  console.log('✓ ensureSchema idempotent passed\n');
}

async function runTests() {
  console.log('=== KIE Usage Repository Tests ===\n');
  let passed = 0, failed = 0;
  for (const fn of [testIncrementAndGet, testDecrement, testEnsureSchemaIsIdempotent]) {
    try {
      await fn();
      passed++;
    } catch (e) {
      console.error(`✗ ${fn.name} FAILED: ${e.message}`);
      failed++;
    }
  }
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error(e); process.exit(1); });
