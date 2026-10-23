const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseDelivery } = require('./delivery-mode');

test('paste mode always pastes, whatever chats are visible', () => {
  for (const visibleChatCount of [0, 1, 2]) assert.equal(chooseDelivery('paste', visibleChatCount), 'paste');
});

test('paste-with-fallback pastes only when exactly one chat is visible', () => {
  assert.equal(chooseDelivery('pasteWithFallback', 0), 'claude');
  assert.equal(chooseDelivery('pasteWithFallback', 1), 'paste');
  assert.equal(chooseDelivery('pasteWithFallback', 2), 'claude');
});

test('claude mode always uses Claude Code\'s own delivery', () => {
  for (const visibleChatCount of [0, 1, 2]) assert.equal(chooseDelivery('claude', visibleChatCount), 'claude');
});
