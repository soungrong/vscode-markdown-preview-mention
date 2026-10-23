const QUOTING_REQUIRED = /[\s:]/;
const WHITESPACE_BEFORE_AT = /[\s。、？！]@/;
const RESERVED_MENTION = /@terminal:|@browser(?=[:\s]|$)/;
const EDGE_WHITESPACE = /^\s|\s$/;

function isRefused(path) {
  return path === ''
    || path.includes('#')
    || path.includes('"')
    || WHITESPACE_BEFORE_AT.test(path)
    || RESERVED_MENTION.test(path)
    || EDGE_WHITESPACE.test(path)
    || path === '~'
    || path.startsWith('~/')
    || path.endsWith(' (agent)');
}

function formatReference(path, startLine, endLine) {
  if (isRefused(path)) return null;
  const target = startLine === endLine ? `${path}#${startLine}` : `${path}#${startLine}-${endLine}`;
  const needsQuotes = QUOTING_REQUIRED.test(path) || path.startsWith('agent-') || path === 'browser';
  return needsQuotes ? `@"${target}"` : `@${target}`;
}

module.exports = { formatReference };
