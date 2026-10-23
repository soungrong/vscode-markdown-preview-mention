const test = require('node:test');
const assert = require('node:assert/strict');
const { formatReference } = require('./mention-reference');

test('a single line is referenced without a range', () => {
  assert.equal(formatReference('docs/plan.md', 5, 5), '@docs/plan.md#5');
});

test('several lines are referenced as a range', () => {
  assert.equal(formatReference('docs/plan.md', 5, 10), '@docs/plan.md#5-10');
});

test('a path with a space is quoted, as Claude quotes it', () => {
  assert.equal(formatReference('Daily/todo 2026-06-30.md', 5, 10), '@"Daily/todo 2026-06-30.md#5-10"');
});

test('a path with a colon is quoted, as Claude quotes it', () => {
  assert.equal(formatReference('notes/a:b.md', 2, 2), '@"notes/a:b.md#2"');
});

test('paths Claude refuses to mention produce no reference', () => {
  for (const path of ['docs/#1.md', 'docs/"quoted".md', '~/notes.md', ' leading.md', 'trailing.md ', 'notes/meet @alex.md']) {
    assert.equal(formatReference(path, 1, 2), null, path);
  }
});
