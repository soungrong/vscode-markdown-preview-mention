const fs = require('fs');
const path = require('path');
const Module = require('module');
const MarkdownIt = require('markdown-it');
const { sourceLineOf } = require('../resolve-range');

const MARKER = '';
const CONTINUATION_PREFIX = /^[\s>]*/;

function usage() {
  console.error('usage: node test/line-mapping-check.cjs <markdown-directory>... [--math <vscode markdown-math extension directory>]');
  process.exit(2);
}

function createRenderer(mathExtensionDirectory) {
  const markdown = MarkdownIt({ html: true, linkify: true });
  if (!mathExtensionDirectory) return markdown;
  const stubbedVscode = {
    workspace: {
      getConfiguration: () => ({ get: (_key, fallback) => fallback }),
      onDidChangeConfiguration: () => ({ dispose() {} }),
    },
    commands: { executeCommand: () => undefined },
  };
  const originalLoad = Module._load;
  Module._load = (request, ...rest) => (request === 'vscode' ? stubbedVscode : originalLoad(request, ...rest));
  const { activate } = require(path.join(mathExtensionDirectory, 'dist', 'extension.js'));
  Module._load = originalLoad;
  return activate({ subscriptions: [] }).extendMarkdownIt(markdown);
}

function markdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') return [];
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(fullPath);
    return entry.name.endsWith('.md') ? [fullPath] : [];
  });
}

function decodeEntities(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function renderedFactsBeforeMarker(html) {
  const markerIndex = html.indexOf(MARKER);
  if (markerIndex === -1) return null;
  const before = html.slice(0, markerIndex);
  const openCode = (before.match(/<code[\s>]/g) || []).length;
  const closeCode = (before.match(/<\/code>/g) || []).length;
  const insideCode = openCode > closeCode;
  const codeOffset = insideCode ? decodeEntities(before.slice(before.lastIndexOf('<code')).replace(/<[^>]*>/g, '')).length : null;
  return {
    offset: (decodeEntities(before.replace(/<[^>]*>/g, '')).match(/\n/g) || []).length,
    codeSpansBefore: closeCode,
    codeOffset,
  };
}

function nextTaggedLine(tokens, inlineIndex, lineCount) {
  for (let index = inlineIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.map && token.type !== 'inline' && !token.hidden) return token.map[0];
  }
  return lineCount;
}

function check(markdown, files) {
  const modes = {
    exact: (lines, boundary) => sourceLineOf(lines, boundary),
    naiveCount: (_lines, boundary) => boundary.line + boundary.offset,
    ignoringCodePosition: (lines, boundary) => sourceLineOf(lines, { ...boundary, codeSpansBefore: 0, codeOffset: null }),
  };
  const bad = Object.fromEntries(Object.keys(modes).map((mode) => [mode, 0]));
  const examples = [];
  let checkedLines = 0;
  let unmeasurableLines = 0;
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const lines = source.split('\n');
    const tokens = markdown.parse(source, {});
    tokens.forEach((token, inlineIndex) => {
      if (token.type !== 'inline' || !token.map || token.map[1] - token.map[0] < 2) return;
      const [blockLine, blockEnd] = token.map;
      const nextLine = nextTaggedLine(tokens, inlineIndex, lines.length);
      for (let line = blockLine; line < blockEnd; line += 1) {
        const prefix = line === blockLine
          ? lines[line].slice(0, Math.max(lines[line].indexOf(token.content.split('\n')[0]), 0))
          : lines[line].match(CONTINUATION_PREFIX)[0];
        const markedLines = [...lines];
        markedLines[line] = prefix + MARKER + lines[line].slice(prefix.length);
        const markedTokens = markdown.parse(markedLines.join('\n'), {});
        const markedInline = markedTokens[inlineIndex];
        const sameStructure = markedTokens.length === tokens.length && markedInline?.type === 'inline'
          && markedInline.map?.[0] === blockLine && markedInline.map?.[1] === blockEnd;
        const facts = sameStructure ? renderedFactsBeforeMarker(markdown.renderer.render(markedInline.children, markdown.options, {})) : null;
        if (facts === null) {
          unmeasurableLines += 1;
          continue;
        }
        checkedLines += 1;
        const boundary = { line: blockLine, nextLine, literal: false, ...facts };
        for (const [mode, map] of Object.entries(modes)) {
          if (map(lines, boundary) === line) continue;
          bad[mode] += 1;
          if (mode === 'exact' && examples.length < 5) examples.push(`${file}:${line + 1} got line ${map(lines, boundary) + 1} for ${JSON.stringify(boundary)}`);
        }
      }
    });
  }
  return { files: files.length, checkedLines, unmeasurableLines, bad, examples };
}

const argv = process.argv.slice(2);
const mathIndex = argv.indexOf('--math');
const mathExtensionDirectory = mathIndex === -1 ? null : argv[mathIndex + 1];
const directories = argv.filter((_argument, index) => mathIndex === -1 || (index !== mathIndex && index !== mathIndex + 1));
if (directories.length === 0 || (mathIndex !== -1 && !mathExtensionDirectory)) usage();

const result = check(createRenderer(mathExtensionDirectory), directories.flatMap(markdownFiles));
console.log(`files=${result.files} checked-lines=${result.checkedLines} unmeasurable-lines=${result.unmeasurableLines} math=${mathExtensionDirectory ? 'vscode' : 'off'}`);
console.log(`wrong lines: exact=${result.bad.exact} naive-count=${result.bad.naiveCount} ignoring-code-position=${result.bad.ignoringCodePosition}`);
result.examples.forEach((example) => console.log(`  ${example}`));
const controlsFail = result.bad.naiveCount > 0 && result.bad.ignoringCodePosition > 0;
if (!controlsFail) console.log('CONTROL DID NOT FAIL: the corpus has no wrapped code span, so this run cannot show the mapping works.');
process.exit(result.bad.exact === 0 && controlsFail ? 0 : 1);
