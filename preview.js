(() => {
  const CLIPBOARD_PAYLOAD_PREFIX = 'markdown-preview-mention:v1:';
  const ARMED_WINDOW_MS = 800;
  const FORMATTING_PARENTS = new Set(['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'UL', 'OL', 'BLOCKQUOTE']);

  let armedAt = 0;

  document.addEventListener('keydown', (event) => {
    const isMentionShortcut = (event.metaKey || event.ctrlKey) && event.code === 'KeyL';
    armedAt = isMentionShortcut ? Date.now() : 0;
  }, true);

  document.addEventListener('copy', (event) => {
    if (Date.now() - armedAt > ARMED_WINDOW_MS) return;
    armedAt = 0;
    const payload = mentionPayload() ?? { error: 'no-selection' };
    event.clipboardData.setData('text/plain', CLIPBOARD_PAYLOAD_PREFIX + JSON.stringify({ ...payload, createdAt: Date.now() }));
    event.preventDefault();
  }, true);

  function mentionPayload() {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    const start = boundaryOf(range.startContainer, range.startOffset);
    const end = endBoundaryOf(range);
    if (!start || !end) return null;
    return { source: previewSource(), start, end };
  }

  function boundaryOf(node, offset) {
    const block = closestBlock(node);
    if (!block) return null;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const literal = element.closest('pre') !== null;
    return {
      line: Number(block.dataset.line),
      offset: countNewlines(textBefore(block, node, offset)),
      nextLine: nextLineAfter(node, offset, block),
      literal,
      ...(literal ? { codeSpansBefore: 0, codeOffset: null } : codePosition(block, node, offset)),
    };
  }

  function endBoundaryOf(range) {
    const block = closestBlock(range.endContainer);
    const endsAtBlockStart = block
      && block !== closestBlock(range.startContainer)
      && textBefore(block, range.endContainer, range.endOffset).trim() === '';
    const previous = endsAtBlockStart ? previousBlock(block) : null;
    if (!previous) return boundaryOf(range.endContainer, range.endOffset);
    const end = lastTextPoint(previous);
    return end && boundaryOf(end.node, end.offset);
  }

  function collapsedRange(node, offset) {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    return range;
  }

  function nextLineAfter(node, offset, block) {
    const point = collapsedRange(node, offset);
    for (const candidate of document.querySelectorAll('.code-line[data-line]')) {
      if (point.comparePoint(candidate, 0) === 1) return Number(candidate.dataset.line);
    }
    return Number(block.dataset.line) + 1;
  }

  function codePosition(block, node, offset) {
    const point = collapsedRange(node, offset);
    let codeSpansBefore = 0;
    for (const code of block.querySelectorAll('code')) {
      if (code.closest('pre') || closestBlock(code) !== block) continue;
      if (point.comparePoint(code, code.childNodes.length) <= 0) {
        codeSpansBefore += 1;
      } else if (point.comparePoint(code, 0) === -1) {
        const insideCode = document.createRange();
        insideCode.setStart(code, 0);
        insideCode.setEnd(node, offset);
        return { codeSpansBefore, codeOffset: insideCode.toString().length };
      }
    }
    return { codeSpansBefore, codeOffset: null };
  }

  function lastTextPoint(block) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let last = null;
    for (let current = walker.nextNode(); current; current = walker.nextNode()) {
      if (FORMATTING_PARENTS.has(current.parentElement.tagName)) continue;
      if (current.data.trim() !== '') last = current;
    }
    return last && { node: last, offset: last.data.trimEnd().length };
  }

  function closestBlock(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return element?.closest('.code-line[data-line]') ?? null;
  }

  function previousBlock(block) {
    const blocks = [...document.querySelectorAll('.code-line[data-line]')];
    for (let index = blocks.indexOf(block) - 1; index >= 0; index--) {
      if (!blocks[index].contains(block)) return blocks[index];
    }
    return null;
  }

  function textBefore(block, node, offset) {
    const range = document.createRange();
    range.setStart(block, 0);
    range.setEnd(node, offset);
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let text = '';
    for (let current = walker.nextNode(); current && range.intersectsNode(current); current = walker.nextNode()) {
      if (FORMATTING_PARENTS.has(current.parentElement.tagName)) continue;
      text += current === range.endContainer ? current.data.slice(0, range.endOffset) : current.data;
    }
    return text;
  }

  function countNewlines(text) {
    return text.split('\n').length - 1;
  }

  function previewSource() {
    const settings = document.getElementById('vscode-markdown-preview-data').getAttribute('data-settings');
    return JSON.parse(settings).source;
  }

  function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  const button = document.createElement('a');
  button.className = 'markdown-preview-mention-button';
  button.textContent = '@ mention';
  button.addEventListener('mousedown', (event) => event.preventDefault());

  let selectionTimer;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(placeButton, 150);
  });

  function placeButton() {
    const payload = mentionPayload();
    if (!payload) {
      button.remove();
      return;
    }
    const rectangles = document.getSelection().getRangeAt(0).getClientRects();
    const lastRectangle = rectangles[rectangles.length - 1];
    button.href = `vscode://soungrong.markdown-preview-mention/insert?payload=${toBase64Url(JSON.stringify(payload))}`;
    button.style.top = `${lastRectangle.bottom + window.scrollY + 4}px`;
    button.style.left = `${lastRectangle.right + window.scrollX}px`;
    if (!button.isConnected) document.body.append(button);
  }
})();
