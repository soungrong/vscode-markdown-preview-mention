const test = require('node:test');
const assert = require('node:assert/strict');
const { CLIPBOARD_PAYLOAD_PREFIX, parseClipboardPayload, parsePayloadJson, resolveRange, sourceLineOf } = require('./resolve-range');

const lines = [
  '# Title',
  '',
  'First line of a paragraph',
  'second line of it.',
  '',
  '```js',
  'const a = 1;',
  'const b = 2;',
  '```',
];

const at = (line, offset = 0, facts = {}) => ({
  line, offset, nextLine: 9, literal: false, codeSpansBefore: 0, codeOffset: null, ...facts,
});
const inCode = (line, offset) => at(line, offset, { literal: true });
const payload = (start, end) => ({ source: 'file:///fixture.md', start, end });
const lineOf = (sourceLines, boundary) => sourceLineOf(sourceLines, {
  nextLine: sourceLines.length, literal: false, codeSpansBefore: 0, codeOffset: null, ...boundary,
});

test('a boundary inside a fenced code block lands on the code line, not the fence line', () => {
  assert.deepEqual(resolveRange(lines, payload(inCode(5, 0), inCode(5, 1))), { startLine: 6, endLine: 7 });
});

test('newline offsets inside a paragraph select its exact source lines', () => {
  assert.deepEqual(resolveRange(lines, payload(at(2, 1), at(2, 1))), { startLine: 3, endLine: 3 });
});

test('lines past the end of the document clamp to its last line', () => {
  assert.deepEqual(resolveRange(lines, payload(at(2), at(40, 0, { nextLine: 41 }))), { startLine: 2, endLine: 8 });
});

test('a selection made backwards still yields start before end', () => {
  assert.deepEqual(resolveRange(lines, payload(inCode(5, 1), at(2))), { startLine: 2, endLine: 7 });
});

const wrappedSpan = [
  '- **Head.** Purging un-wedged apt (`E: needs to be',
  '  reinstalled`). The next daily run',
  '  more text.',
  '  The same allowed-origins list.',
  '- **Next item.**',
];

test('a code span wrapping before the boundary does not shorten the line count', () => {
  assert.equal(lineOf(wrappedSpan, { line: 0, offset: 2, codeSpansBefore: 1, nextLine: 4 }), 3);
});

test('a boundary inside a wrapped code span lands on the side of its line break the boundary is on', () => {
  const insideSpan = { line: 0, offset: 0, codeSpansBefore: 0, nextLine: 4 };
  assert.equal(lineOf(wrappedSpan, { ...insideSpan, codeOffset: 0 }), 0);
  assert.equal(lineOf(wrappedSpan, { ...insideSpan, codeOffset: 'E: needs to be '.length }), 1);
});

test('a boundary after a wrapped code span on the same rendered line lands on the span\'s last line', () => {
  assert.equal(lineOf(wrappedSpan, { line: 0, offset: 0, codeSpansBefore: 1, nextLine: 4 }), 1);
});

test('a double-backtick span closes only at a double-backtick run', () => {
  assert.equal(lineOf(['a ``b `c`', 'd`` e', 'f', 'g'], { line: 0, offset: 1, codeSpansBefore: 1 }), 2);
});

test('an unmatched backtick does not pair with a later run of a different length', () => {
  assert.equal(lineOf(['a ` b', 'c ``x``', 'd', 'e'], { line: 0, offset: 2, codeSpansBefore: 1 }), 2);
});

test('a backslash-escaped backtick opens no code span', () => {
  assert.equal(lineOf(['a \\` b', 'c` d', 'e', 'f'], { line: 0, offset: 2, codeSpansBefore: 0 }), 2);
});

test('an escaped backslash before a backtick leaves the backtick free to open a span', () => {
  assert.equal(lineOf(['a \\\\`code', 'wrap` b', 'c', 'd'], { line: 0, offset: 1, codeSpansBefore: 1 }), 2);
});

test('backticks inside a fenced code block are literal', () => {
  assert.equal(lineOf(['```', 'a `b', 'c` d', '```'], { line: 0, offset: 1, literal: true }), 2);
});

test('the search for closing backticks stops at the next block', () => {
  assert.equal(lineOf(['a `b', 'c', '', 'd `e', 'f`'], { line: 0, offset: 1, nextLine: 2 }), 1);
});

test('a code span with one space trimmed from each end maps its offset past the leading space', () => {
  assert.equal(lineOf(['a ` x', 'y ` b'], { line: 0, offset: 0, codeOffset: 'x '.length }), 1);
});

test('continuation indentation inside a code span is not counted as rendered text', () => {
  assert.equal(lineOf(['- `aa', '  bb', '  cc` d'], { line: 0, offset: 0, codeOffset: 'aa bb '.length }), 2);
});

test('known limit: text after a nested fenced block in a tight list item maps one line late', () => {
  const tightItem = ['- item', '  ```', '  code', '  ```', '  after', '  more'];
  assert.equal(lineOf(tightItem, { line: 0, offset: 3, codeSpansBefore: 0 }), 5);
});

test('ordinary clipboard text is never read as a mention request', () => {
  assert.equal(parseClipboardPayload('some text the user copied', 1000), null);
  assert.equal(parseClipboardPayload(`${CLIPBOARD_PAYLOAD_PREFIX}not json`, 1000), null);
  const otherPrefix = 'x'.repeat(CLIPBOARD_PAYLOAD_PREFIX.length);
  const freshPayload = JSON.stringify({ ...payload(at(2), at(3)), createdAt: 1000 });
  assert.equal(parseClipboardPayload(`${otherPrefix}${freshPayload}`, 1000), null);
});

test('a clipboard payload older than five seconds is refused', () => {
  const text = `${CLIPBOARD_PAYLOAD_PREFIX}${JSON.stringify({ ...payload(at(2), at(3)), createdAt: 1000 })}`;
  assert.notEqual(parseClipboardPayload(text, 1000 + 4999), null);
  assert.equal(parseClipboardPayload(text, 1000 + 5001), null);
});

test('a payload with a malformed boundary is refused', () => {
  assert.equal(parsePayloadJson(JSON.stringify(payload(at(-1), at(3)))), null);
  assert.equal(parsePayloadJson(JSON.stringify(payload(at(2), { line: 3, offset: 0 }))), null);
  assert.equal(parsePayloadJson(JSON.stringify(payload(at(2), at(3, 0, { codeOffset: -1 })))), null);
});
