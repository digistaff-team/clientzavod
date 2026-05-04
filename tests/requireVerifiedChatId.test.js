const assert = require('assert');

// Мок manage/store
let mockState = null;
require.cache[require.resolve('../manage/store')] = {
    id: require.resolve('../manage/store'),
    filename: require.resolve('../manage/store'),
    loaded: true,
    exports: {
        getState: (chatId) => mockState
    }
};

const requireVerifiedChatId = require('../middleware/requireVerifiedChatId');

function makeReqRes(chatIdSource) {
    const req = { body: {}, params: {}, query: {}, ...chatIdSource };
    const res = {
        _status: null, _json: null,
        status(code) { this._status = code; return this; },
        json(data) { this._json = data; return this; }
    };
    return { req, res };
}

let passed = 0;

// Test 1: нет chatId → 400
{
    const mw = requireVerifiedChatId(req => req.body.chat_id);
    const { req, res } = makeReqRes({ body: {} });
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(res._status, 400, 'должен вернуть 400 если chatId не передан');
    assert.strictEqual(nextCalled, false);
    passed++;
}

// Test 2: state не существует → 403
{
    mockState = null;
    const mw = requireVerifiedChatId(req => req.body.chat_id);
    const { req, res } = makeReqRes({ body: { chat_id: '12345' } });
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(res._status, 403, 'должен вернуть 403 если state не найден');
    assert.strictEqual(nextCalled, false);
    passed++;
}

// Test 3: state без verifiedTelegramId → 403
{
    mockState = { onboardingComplete: false };
    const mw = requireVerifiedChatId(req => req.body.chat_id);
    const { req, res } = makeReqRes({ body: { chat_id: '12345' } });
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(res._status, 403, 'должен вернуть 403 если verifiedTelegramId не задан');
    assert.strictEqual(nextCalled, false);
    passed++;
}

// Test 4: state с verifiedTelegramId → next()
{
    mockState = { verifiedTelegramId: 12345 };
    const mw = requireVerifiedChatId(req => req.body.chat_id);
    const { req, res } = makeReqRes({ body: { chat_id: '12345' } });
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'должен вызвать next() если verifiedTelegramId задан');
    passed++;
}

// Test 5: getChatId из req.params
{
    mockState = { verifiedTelegramId: 99999 };
    const mw = requireVerifiedChatId(req => req.params.chat_id);
    const { req, res } = makeReqRes({ params: { chat_id: '99999' } });
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'должен работать с chatId из params');
    passed++;
}

// Test 6: getChatId из req.query
{
    mockState = { verifiedTelegramId: 77777 };
    const mw = requireVerifiedChatId(req => req.query.chatId || req.body.chatId);
    const { req, res } = makeReqRes({ query: { chatId: '77777' } });
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'должен работать с chatId из query');
    passed++;
}

console.log(`requireVerifiedChatId: ${passed}/6 тестов прошли`);
