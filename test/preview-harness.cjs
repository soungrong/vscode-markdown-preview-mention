const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');
const { chromium } = require('playwright');
const { parseClipboardPayload, resolveRange } = require('../resolve-range');

const EXPECTED_ROW = /^\d+\. (Select|Drag from|Triple-click) "([^"]+)"(?: to "([^"]+)")?.*: `#(\d+)(?:-(\d+))?`\.$/;

function createRenderer() {
  const markdown = MarkdownIt({ html: true, linkify: true });
  markdown.core.ruler.push('source_map_data_attribute', (state) => {
    for (const token of state.tokens) {
      if (!token.map || token.type === 'inline') continue;
      token.attrSet('data-line', String(token.map[0]));
      token.attrJoin('class', 'code-line');
    }
  });
  return markdown;
}

function previewHtml(source) {
  const settings = JSON.stringify({ source: 'file:///fixture.md' }).replace(/"/g, '&quot;');
  const lineCount = source.split('\n').length;
  return `<html><head><meta id="vscode-markdown-preview-data" data-settings="${settings}"></head>
<body><div class="markdown-body">${createRenderer().render(source)}<div class="code-line" data-line="${lineCount}"></div></div></body></html>`;
}

function expectedRows(source) {
  return source.split('\n').map((line) => line.match(EXPECTED_ROW)).filter(Boolean).map((match) => ({
    action: match[1],
    from: match[2],
    to: match[3] ?? match[2],
    expected: match[5] ? `#${match[4]}-${match[5]}` : `#${match[4]}`,
  }));
}

async function select(page, row) {
  if (row.action === 'Triple-click') {
    await page.getByText(row.from, { exact: false }).first().click({ clickCount: 3 });
    return;
  }
  await page.evaluate(({ from, to }) => {
    const locate = (needle) => {
      const walker = document.createTreeWalker(document.querySelector('.markdown-body'), NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = node.data.indexOf(needle);
        if (index >= 0) return { node, index };
      }
      throw new Error(`text not found in the rendered fixture: ${needle}`);
    };
    const start = locate(from);
    const end = locate(to);
    const range = document.createRange();
    range.setStart(start.node, start.index);
    range.setEnd(end.node, end.index + to.length);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(range);
  }, row);
}

async function referenceForSelection(page, lines) {
  const clipboardText = await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL', metaKey: true, bubbles: true }));
    const data = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    return data.getData('text/plain');
  });
  const payload = parseClipboardPayload(clipboardText, Date.now());
  if (payload === null || payload.error) return `no payload (${clipboardText.slice(0, 80)})`;
  const { startLine, endLine } = resolveRange(lines, payload);
  return startLine === endLine ? `#${startLine + 1}` : `#${startLine + 1}-${endLine + 1}`;
}

async function main() {
  const fixturePath = process.argv[2];
  if (!fixturePath) {
    console.error('usage: node test/preview-harness.cjs <fixture.md>');
    process.exit(2);
  }
  const source = fs.readFileSync(fixturePath, 'utf8');
  const lines = source.split('\n');
  const rows = expectedRows(source);
  if (rows.length === 0) {
    console.error(`no expected-reference rows found in ${fixturePath}`);
    process.exit(1);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(previewHtml(source));
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'preview.js'), 'utf8') });
  let failures = 0;
  for (const row of rows) {
    await select(page, row);
    const reference = await referenceForSelection(page, lines);
    const passed = reference === row.expected;
    if (!passed) failures += 1;
    console.log(`${passed ? 'ok  ' : 'FAIL'} ${row.action} "${row.from}"${row.to === row.from ? '' : ` to "${row.to}"`}: expected ${row.expected}, got ${reference}`);
  }
  await browser.close();
  console.log(failures === 0 ? `all ${rows.length} rows passed` : `${failures} of ${rows.length} rows FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
