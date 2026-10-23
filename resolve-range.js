const CLIPBOARD_PAYLOAD_PREFIX = 'markdown-preview-mention:v1:';
const MAXIMUM_CLIPBOARD_PAYLOAD_AGE_MS = 5000;
const FENCE_OPENING = /^[\s>]*(`{3,}|~{3,})/;

const isCount = (value) => Number.isInteger(value) && value >= 0;

function isBoundary(value) {
  return isCount(value?.line)
    && isCount(value?.offset)
    && isCount(value?.nextLine)
    && typeof value?.literal === 'boolean'
    && isCount(value?.codeSpansBefore)
    && (value?.codeOffset === null || isCount(value?.codeOffset));
}

function parsePayloadJson(json) {
  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (payload?.error === 'no-selection') return { error: 'no-selection', createdAt: payload.createdAt };
  if (typeof payload?.source !== 'string' || !isBoundary(payload.start) || !isBoundary(payload.end)) return null;
  return { source: payload.source, start: payload.start, end: payload.end, createdAt: payload.createdAt };
}

function parseClipboardPayload(text, now) {
  if (typeof text !== 'string' || !text.startsWith(CLIPBOARD_PAYLOAD_PREFIX)) return null;
  const payload = parsePayloadJson(text.slice(CLIPBOARD_PAYLOAD_PREFIX.length));
  if (typeof payload?.createdAt !== 'number' || now - payload.createdAt > MAXIMUM_CLIPBOARD_PAYLOAD_AGE_MS) return null;
  return payload;
}

function countNewlines(text) {
  return text.split('\n').length - 1;
}

function backtickRunLength(source, index) {
  let length = 0;
  while (source[index + length] === '`') length += 1;
  return length;
}

function isEscaped(source, index) {
  let backslashes = 0;
  while (source[index - 1 - backslashes] === '\\') backslashes += 1;
  return backslashes % 2 === 1;
}

function findClosingRun(source, from, length) {
  let index = from;
  while (index < source.length) {
    if (source[index] !== '`') {
      index += 1;
      continue;
    }
    const run = backtickRunLength(source, index);
    if (run === length) return index;
    index += run;
  }
  return -1;
}

function breaksBeforeCodeOffset(content, codeOffset) {
  const withoutContinuationIndent = content.replace(/\n[ \t]*/g, '\n');
  const strippedOneSpace = /^ (.+) $/.test(withoutContinuationIndent.replace(/\n/g, ' '));
  const sourceIndex = codeOffset + (strippedOneSpace ? 1 : 0);
  return countNewlines(withoutContinuationIndent.slice(0, sourceIndex));
}

function sourceBreaksBefore(source, boundary) {
  let renderedBreaks = 0;
  let codeSpans = 0;
  let sourceBreaks = 0;
  let index = 0;
  while (index < source.length) {
    const pastRenderedBreaks = renderedBreaks === boundary.offset;
    if (source[index] === '`' && !isEscaped(source, index)) {
      const run = backtickRunLength(source, index);
      const close = findClosingRun(source, index + run, run);
      if (close === -1) {
        index += run;
        continue;
      }
      if (pastRenderedBreaks && codeSpans >= boundary.codeSpansBefore) {
        if (boundary.codeOffset === null) return sourceBreaks;
        return sourceBreaks + breaksBeforeCodeOffset(source.slice(index + run, close), boundary.codeOffset);
      }
      sourceBreaks += countNewlines(source.slice(index, close));
      codeSpans += 1;
      index = close + run;
      continue;
    }
    if (source[index] === '\n') {
      if (pastRenderedBreaks) return sourceBreaks;
      renderedBreaks += 1;
      sourceBreaks += 1;
    }
    index += 1;
  }
  return sourceBreaks;
}

function sourceLineOf(lines, boundary) {
  if (boundary.literal) {
    const opensFence = FENCE_OPENING.test(lines[boundary.line] ?? '');
    return boundary.line + boundary.offset + (opensFence ? 1 : 0);
  }
  const blockSource = lines.slice(boundary.line, Math.max(boundary.nextLine, boundary.line + 1)).join('\n');
  return boundary.line + sourceBreaksBefore(blockSource, boundary);
}

function resolveRange(lines, payload) {
  const lastLine = lines.length - 1;
  const clamp = (line) => Math.min(Math.max(line, 0), lastLine);
  const first = clamp(sourceLineOf(lines, payload.start));
  const second = clamp(sourceLineOf(lines, payload.end));
  return { startLine: Math.min(first, second), endLine: Math.max(first, second) };
}

module.exports = { CLIPBOARD_PAYLOAD_PREFIX, parsePayloadJson, parseClipboardPayload, resolveRange, sourceLineOf };
