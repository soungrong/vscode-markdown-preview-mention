const vscode = require('vscode');
const { CLIPBOARD_PAYLOAD_PREFIX, parseClipboardPayload, parsePayloadJson, resolveRange } = require('./resolve-range');
const { formatReference } = require('./mention-reference');
const { DELIVERY_SETTING, chooseDelivery } = require('./delivery-mode');

const HANDOFF_TIMEOUT_MS = 1000;
const POLL_INTERVAL_MS = 25;
const CHAT_FOCUS_DELAY_MS = 150;
const CLIPBOARD_RESTORE_DELAY_MS = 1000;
const NO_CHAT_HINT_MS = 5000;
const CLAUDE_CHAT_VIEW_TYPE = 'claudeVSCodePanel';

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownPreviewMention.insertFromPreview', () => withClipboardRestored(insertFromPreview)),
    vscode.window.registerUriHandler({ handleUri: (uri) => withClipboardRestored((placeOnClipboard) => insertFromLink(uri, placeOnClipboard)) }),
  );
}

async function withClipboardRestored(operation) {
  const savedClipboard = await vscode.env.clipboard.readText();
  let placedText = null;
  const placeOnClipboard = async (text) => {
    placedText = text;
    await vscode.env.clipboard.writeText(text);
  };
  try {
    await operation(placeOnClipboard);
  } finally {
    if (placedText !== null) await sleep(CLIPBOARD_RESTORE_DELAY_MS);
    const current = await vscode.env.clipboard.readText();
    if (current === placedText || current.startsWith(CLIPBOARD_PAYLOAD_PREFIX)) {
      await vscode.env.clipboard.writeText(savedClipboard);
    }
  }
}

async function insertFromPreview(placeOnClipboard) {
  await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
  const payload = await waitForClipboardPayload();
  if (payload === null) {
    vscode.window.showWarningMessage(
      'Markdown Preview Mention: the Markdown preview did not answer the copy handoff within 1 second. Its script may not be loaded; try "Developer: Reload Window".',
    );
    return;
  }
  await insertOrExplain(payload, placeOnClipboard);
}

async function insertFromLink(uri, placeOnClipboard) {
  const encoded = new URLSearchParams(uri.query).get('payload');
  const payload = uri.path === '/insert' && encoded
    ? parsePayloadJson(Buffer.from(encoded, 'base64url').toString('utf8'))
    : null;
  if (payload === null) {
    vscode.window.showErrorMessage(`Markdown Preview Mention: cannot read the link ${uri.toString()}`);
    return;
  }
  await insertOrExplain(payload, placeOnClipboard);
}

async function waitForClipboardPayload() {
  const deadline = Date.now() + HANDOFF_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const payload = parseClipboardPayload(await vscode.env.clipboard.readText(), Date.now());
    if (payload !== null) return payload;
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function insertOrExplain(payload, placeOnClipboard) {
  if (payload.error === 'no-selection') {
    vscode.window.showInformationMessage('Markdown Preview Mention: select some text in the preview first.');
    return;
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(payload.source));
  const lines = Array.from({ length: document.lineCount }, (_, line) => document.lineAt(line).text);
  const { startLine, endLine } = resolveRange(lines, payload);
  const mode = vscode.workspace.getConfiguration().get(DELIVERY_SETTING);
  const visibleChatCount = visibleClaudeChatTabs().length;
  if (chooseDelivery(mode, visibleChatCount) === 'claude') {
    await deliverThroughClaude(document, startLine, endLine);
    return;
  }
  await pasteMention(document, startLine, endLine, placeOnClipboard);
  if (visibleChatCount === 0) {
    vscode.window.setStatusBarMessage(
      'Markdown Preview Mention: no Claude chat tab was visible. If nothing was inserted, the chat was still starting; press Cmd+L again, or set "markdownPreviewMention.delivery" to "pasteWithFallback".',
      NO_CHAT_HINT_MS,
    );
  }
}

function isClaudeChatTab(tab) {
  return tab?.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith(CLAUDE_CHAT_VIEW_TYPE);
}

function visibleClaudeChatTabs() {
  return vscode.window.tabGroups.all.map((group) => group.activeTab).filter(isClaudeChatTab);
}

async function pasteMention(document, startLine, endLine, placeOnClipboard) {
  const path = vscode.workspace.asRelativePath(document.fileName);
  const reference = formatReference(path, startLine + 1, endLine + 1);
  if (reference === null) {
    vscode.window.showWarningMessage(`Markdown Preview Mention: Claude Code cannot @-mention the path ${path}.`);
    return;
  }
  await placeOnClipboard(`${reference} `);
  await vscode.commands.executeCommand('claude-vscode.focus');
  await sleep(CHAT_FOCUS_DELAY_MS);
  await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
}

async function deliverThroughClaude(document, startLine, endLine) {
  const mentionSelection = new vscode.Selection(startLine, 0, endLine, document.lineAt(endLine).text.length);
  const visibleEditor = vscode.window.visibleTextEditors.find((editor) => editor.document.uri.toString() === document.uri.toString());
  if (visibleEditor) {
    const { selections, visibleRanges } = visibleEditor;
    visibleEditor.selection = mentionSelection;
    await vscode.window.showTextDocument(document, { viewColumn: visibleEditor.viewColumn });
    await vscode.commands.executeCommand('claude-vscode.insertAtMention');
    visibleEditor.selections = selections;
    visibleEditor.revealRange(visibleRanges[0], vscode.TextEditorRevealType.AtTop);
    return;
  }
  await vscode.window.showTextDocument(document, { viewColumn: sourceColumnFor(document.uri), selection: mentionSelection, preview: false });
  await vscode.commands.executeCommand('claude-vscode.insertAtMention');
}

function sourceColumnFor(uri) {
  const activeColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
  const otherGroupWithSource = textTabsFor(uri).map((tab) => tab.group).find((group) => group.viewColumn !== activeColumn);
  if (otherGroupWithSource) return otherGroupWithSource.viewColumn;
  const groupBeside = vscode.window.tabGroups.all.find((group) => group.viewColumn === activeColumn + 1);
  if (!groupBeside || !isClaudeChatTab(groupBeside.activeTab)) return vscode.ViewColumn.Beside;
  return Math.max(...vscode.window.tabGroups.all.map((group) => group.viewColumn)) + 1;
}

function textTabsFor(uri) {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString());
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

module.exports = { activate };
