const fs = require('fs');
const path = require('path');
const { expectedRows } = require('./fixture-rows.cjs');
const { CannotRun, REPOSITORY, VSCodeSession, waitUntil } = require('./vscode-session.cjs');

const CHECK_TIMEOUT_MS = 120000;
const RESULT_TIMEOUT_MS = 8000;
const NEW_CHAT_TIMEOUT_MS = 30000;
const QUIET_PERIOD_MS = 3000;
const CLIPBOARD_RESTORE_MS = 1500;
const NO_CHAT_HINT = 'no Claude chat tab was visible';
const PREVIEW_TAB = 'Preview fixture.md';
const CLAUDE_TAB = 'Claude Code';
const DELIVERY_SETTING = 'markdownPreviewMention.delivery';

const FIXTURE = fs.readFileSync(path.join(REPOSITORY, 'fixture.md'), 'utf8');
const WORKSPACE_FILES = {
  'fixture.md': FIXTURE,
  'plans/plan.md': FIXTURE,
  'refused#name.md': '# Refused\n\nClaude Code refuses to mention a path containing a hash.\n',
};
const SETTINGS = {
  'window.dialogStyle': 'custom',
  'workbench.startupEditor': 'none',
  'chat.disableAIFeatures': true,
  'workbench.editorAssociations': { '**/plans/*.md': 'vscode.markdown.preview.editor' },
  [DELIVERY_SETTING]: 'paste',
};
const OWNER_KEYBINDINGS = [
  { key: 'cmd+l', command: '-expandLineSelection', when: 'textInputFocus' },
  { key: 'cmd+l', command: 'claude-vscode.insertAtMention', when: 'editorTextFocus' },
  { key: 'alt+k', command: '-claude-vscode.insertAtMention', when: 'editorTextFocus' },
];

const reference = (lines, file = 'fixture.md') => `@${file}#${lines}`;
const BOLD_TEXT = { action: 'Select', from: 'bold text' };

async function openPreview(session, file) {
  await session.openFile(file);
  await session.page.locator('.editor-group-container.active .monaco-editor .view-lines').click();
  await session.runCommand('Markdown: Open Preview');
  await session.previewFrame();
}

async function openChatTab(session, expectedChats) {
  await session.runCommand('Claude Code: Open in New Tab');
  await session.waitForClaudeChats(expectedChats);
}

const LAYOUTS = {
  'preview and one chat tab': async (session) => {
    await openPreview(session, 'fixture.md');
    await openChatTab(session, 1);
  },
  'Markdown Preview editor and one chat tab': async (session) => {
    await session.openFile('plan.md');
    await session.previewFrame();
    await openChatTab(session, 1);
  },
  'preview and two chat tabs side by side': async (session) => {
    await openPreview(session, 'fixture.md');
    await openChatTab(session, 1);
    await openChatTab(session, 2);
    await session.runCommand('View: Move Editor into Next Group');
    const actives = (await session.tabGroups()).map((group) => group.active);
    if (JSON.stringify(actives) !== JSON.stringify([PREVIEW_TAB, CLAUDE_TAB, CLAUDE_TAB])) throw new Error(`layout setup failed: groups show ${JSON.stringify(actives)}`);
  },
  'preview and no chat': async (session) => {
    await openPreview(session, 'fixture.md');
    await waitUntil(() => session.claudeFrames(), (frames) => frames.length === 0, RESULT_TIMEOUT_MS, 'layout setup failed: a Claude chat is still open');
  },
  'preview of a refused path and one chat tab': async (session) => {
    await openPreview(session, 'refused#name.md');
    await openChatTab(session, 1);
  },
  'text editor and one chat tab': async (session) => {
    await session.openFile('fixture.md');
    await openChatTab(session, 1);
  },
  'preview and a side-bar chat': async (session) => {
    await openPreview(session, 'fixture.md');
    await session.runCommand('Claude Code: Open in Side Bar');
    await session.waitForClaudeChats(1);
  },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForChats(session, isDone, describe, timeout = RESULT_TIMEOUT_MS) {
  return waitUntil(() => session.chats(), isDone, timeout, describe);
}

async function chatsAfterQuietPeriod(session) {
  await session.page.waitForTimeout(QUIET_PERIOD_MS);
  return session.chats();
}

async function waitForStatusHint(session) {
  await waitUntil(() => session.statusBarText(), (text) => text.includes(NO_CHAT_HINT), RESULT_TIMEOUT_MS, `the status bar never showed "${NO_CHAT_HINT}"`);
}

function countTabs(groups) {
  const counts = new Map();
  for (const label of groups.flatMap((group) => group.tabs)) counts.set(label, (counts.get(label) ?? 0) + 1);
  return counts;
}

function assertTabsUnchanged(before, after) {
  assert(JSON.stringify(before) === JSON.stringify(after), `the tabs changed: before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`);
}

function assertNothingClosedOrCovered(before, after) {
  const afterCounts = countTabs(after);
  for (const [label, count] of countTabs(before)) {
    assert((afterCounts.get(label) ?? 0) >= count, `a "${label}" tab was closed: before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`);
  }
  for (const shown of [PREVIEW_TAB, CLAUDE_TAB]) {
    const visible = (groups) => groups.filter((group) => group.active === shown).length;
    assert(visible(after) >= visible(before), `the source opened over a visible "${shown}": before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`);
  }
}

async function mentionBoldText(session, mode) {
  await session.writeSettings({ [DELIVERY_SETTING]: mode });
  await session.clearChats();
  const before = await session.tabGroups();
  await session.selectInPreview(BOLD_TEXT);
  await session.press('Meta+L');
  return before;
}

const hasReference = (chat) => chat.text === reference(4);
const hasChip = (chat) => chat.chips.includes(reference(4));

function fixtureChecks(previewKind, layout, file) {
  return expectedRows(FIXTURE).map((row, index) => ({
    name: `${previewKind}, fixture step ${index + 1}: ${row.action} "${row.from}"${row.to === row.from ? '' : ` to "${row.to}"`} gives ${reference(row.expected.slice(1), file)}`,
    layout,
    run: async (session) => {
      const expected = reference(row.expected.slice(1), file);
      await session.clearChats();
      await session.selectInPreview(row);
      await session.press('Meta+L');
      await waitForChats(session, (chats) => chats.length === 1 && chats[0].text === expected, `the chat never showed ${expected}`);
      await session.page.waitForTimeout(CLIPBOARD_RESTORE_MS);
    },
  }));
}

const BUTTON_CHECKS = [
  {
    name: 'mention button: the first click asks to open the URI, and "Open" with "Do not ask me again" delivers',
    layout: 'preview and one chat tab',
    run: async (session) => {
      await session.clearChats();
      const preview = await session.selectInPreview(BOLD_TEXT);
      await session.page.waitForTimeout(500);
      await preview.locator('.markdown-preview-mention-button').click();
      const dialog = await waitUntil(() => session.dialogText(), (text) => text !== null, RESULT_TIMEOUT_MS, 'no "open this URI" dialog appeared');
      assert(dialog.includes("Allow 'Markdown Preview Mention' extension to open this URI?"), `unexpected dialog: ${dialog}`);
      await session.page.locator('.monaco-dialog-box').getByRole('checkbox').click();
      await session.page.locator('.monaco-dialog-box .monaco-button', { hasText: /^Open$/ }).click();
      await waitForChats(session, (chats) => chats.length === 1 && hasReference(chats[0]), `the chat never showed ${reference(4)}`);
      await session.page.waitForTimeout(CLIPBOARD_RESTORE_MS);
    },
  },
  {
    name: 'mention button: after "Do not ask me again", later clicks deliver without asking',
    layout: 'preview and one chat tab',
    run: async (session) => {
      await session.clearChats();
      const preview = await session.selectInPreview({ action: 'Select', from: 'Nested item one' });
      await session.page.waitForTimeout(500);
      await preview.locator('.markdown-preview-mention-button').click();
      await waitForChats(session, (chats) => chats.length === 1 && chats[0].text === reference(9), `the chat never showed ${reference(9)}`);
      assert((await session.dialogText()) === null, 'the "open this URI" dialog appeared again');
      await session.page.waitForTimeout(CLIPBOARD_RESTORE_MS);
    },
  },
];

const DELIVERY_CHECKS = [
  ...['paste', 'pasteWithFallback'].map((mode) => ({
    name: `${mode}, one chat tab visible: pasted as plain text, no tab opens or closes`,
    layout: 'preview and one chat tab',
    run: async (session) => {
      const before = await mentionBoldText(session, mode);
      const [chat] = await waitForChats(session, (chats) => chats.length === 1 && hasReference(chats[0]), `the chat never showed ${reference(4)}`);
      assert(!hasChip(chat), 'the pasted reference was drawn as a chip');
      assertTabsUnchanged(before, await session.tabGroups());
      await session.page.waitForTimeout(CLIPBOARD_RESTORE_MS);
    },
  })),
  {
    name: 'claude, one chat tab visible: delivered by Claude with a chip, source opens without covering anything',
    layout: 'preview and one chat tab',
    changesLayout: true,
    run: async (session) => {
      const before = await mentionBoldText(session, 'claude');
      await waitForChats(session, (chats) => chats.length === 1 && hasReference(chats[0]) && hasChip(chats[0]), `the chat never showed ${reference(4)} as a chip`);
      const after = await session.tabGroups();
      assertNothingClosedOrCovered(before, after);
      assert(after.at(-1).active === 'fixture.md', `the source did not open in a new group at the far right: ${JSON.stringify(after)}`);
    },
  },
  {
    name: 'paste, no chat open: a new chat opens but stays empty, and the status bar says to press again',
    layout: 'preview and no chat',
    changesLayout: true,
    run: async (session) => {
      await mentionBoldText(session, 'paste');
      await waitForStatusHint(session);
      await session.waitForClaudeChats(1);
      const chats = await chatsAfterQuietPeriod(session);
      assert(chats.every((chat) => chat.text === ''), `the new chat was not empty: ${JSON.stringify(chats)}`);
    },
  },
  ...['pasteWithFallback', 'claude'].map((mode) => ({
    name: `${mode}, no chat open: a new chat opens with the reference`,
    layout: 'preview and no chat',
    changesLayout: true,
    run: async (session) => {
      await mentionBoldText(session, mode);
      await waitForChats(session, (chats) => chats.length === 1 && hasReference(chats[0]) && hasChip(chats[0]), `no new chat showed ${reference(4)} as a chip`, NEW_CHAT_TIMEOUT_MS);
    },
  })),
  {
    name: 'paste, two chats visible: only the focused one gets it, no tab opens or closes',
    layout: 'preview and two chat tabs side by side',
    run: async (session) => {
      const before = await mentionBoldText(session, 'paste');
      await waitForChats(session, (chats) => chats.some(hasReference), `no chat showed ${reference(4)}`);
      const chats = await chatsAfterQuietPeriod(session);
      assert(chats.filter(hasReference).length === 1 && chats.filter((chat) => chat.text === '').length === 1, `expected exactly one chat with the reference and one empty: ${JSON.stringify(chats)}`);
      assertTabsUnchanged(before, await session.tabGroups());
      await session.page.waitForTimeout(CLIPBOARD_RESTORE_MS);
    },
  },
  ...['pasteWithFallback', 'claude'].map((mode) => ({
    name: `${mode}, two chats visible: every visible chat gets it, nothing is closed or covered`,
    layout: 'preview and two chat tabs side by side',
    changesLayout: true,
    run: async (session) => {
      const before = await mentionBoldText(session, mode);
      await waitForChats(session, (chats) => chats.length === 2 && chats.every((chat) => hasReference(chat) && hasChip(chat)), `the two chats did not both show ${reference(4)} as a chip`);
      assertNothingClosedOrCovered(before, await session.tabGroups());
    },
  })),
];

const NON_BEHAVIOUR_CHECKS = [
  {
    name: 'the clipboard text from before the press is put back',
    layout: 'preview and one chat tab',
    run: async (session) => {
      await session.clearChats();
      await session.writeClipboard('clipboard text from before the press');
      await session.selectInPreview(BOLD_TEXT);
      await session.press('Meta+L');
      await waitForChats(session, (chats) => chats.length === 1 && hasReference(chats[0]), `the chat never showed ${reference(4)}`);
      await waitUntil(() => session.readClipboard(), (text) => text === 'clipboard text from before the press', RESULT_TIMEOUT_MS, 'the clipboard was not restored');
    },
  },
  {
    name: 'Cmd+C in the preview still copies the selected text',
    layout: 'preview and one chat tab',
    run: async (session) => {
      await session.writeClipboard('');
      await session.selectInPreview(BOLD_TEXT);
      await session.press('Meta+C');
      await waitUntil(() => session.readClipboard(), (text) => text === 'bold text', RESULT_TIMEOUT_MS, 'Cmd+C did not copy "bold text"');
    },
  },
  {
    name: 'Cmd+L in a text editor still runs Claude\'s own command (with the owner\'s Cmd+L rebinding)',
    layout: 'text editor and one chat tab',
    run: async (session) => {
      await session.clearChats();
      await session.page.locator('.editor-group-container .monaco-editor .view-lines').first().click();
      await session.page.keyboard.press('Control+G');
      await session.page.keyboard.type('4');
      await session.page.keyboard.press('Enter');
      await session.page.keyboard.press('Home');
      await session.page.keyboard.press('Shift+End');
      await session.press('Meta+L');
      await waitForChats(session, (chats) => chats.length === 1 && hasChip(chats[0]), `Claude's own command did not insert ${reference(4)} as a chip`);
    },
  },
  ...[
    ['the Explorer', (session) => session.press('Meta+Shift+E')],
    ['a panel', (session) => session.runCommand('View: Focus into Panel')],
  ].map(([place, moveFocus]) => ({
    name: `with a preview selection but focus in ${place}, Cmd+L does nothing`,
    layout: 'preview and one chat tab',
    changesLayout: true,
    run: async (session) => {
      await session.clearChats();
      const before = await session.tabGroups();
      await session.selectInPreview(BOLD_TEXT);
      await moveFocus(session);
      await session.press('Meta+L');
      const chats = await chatsAfterQuietPeriod(session);
      assert(chats.every((chat) => chat.text === ''), `a chat received something: ${JSON.stringify(chats)}`);
      const toasts = (await session.toasts()).filter((toast) => toast.includes('Markdown Preview Mention'));
      assert(toasts.length === 0, `the extension reacted: ${JSON.stringify(toasts)}`);
      assertTabsUnchanged(before, await session.tabGroups());
    },
  })),
];

async function waitForToast(session, text) {
  await waitUntil(() => session.toasts(), (toasts) => toasts.some((toast) => toast.includes(text)), RESULT_TIMEOUT_MS, `no notification said "${text}"`);
}

const FAILURE_CHECKS = [
  {
    name: 'Cmd+L with nothing selected says to select some text',
    layout: 'preview and one chat tab',
    run: async (session) => {
      const preview = await session.previewFrame();
      await preview.locator('h1').click();
      await preview.evaluate(() => document.getSelection().removeAllRanges());
      await session.press('Meta+L');
      await waitForToast(session, 'select some text in the preview first');
    },
  },
  {
    name: 'a preview whose script does not answer gives a warning instead of silence',
    layout: 'preview and one chat tab',
    changesLayout: true,
    run: async (session) => {
      await session.clearChats();
      const preview = await session.selectInPreview(BOLD_TEXT);
      await preview.evaluate(() => window.addEventListener('copy', (event) => event.stopImmediatePropagation(), true));
      await session.press('Meta+L');
      await waitForToast(session, 'did not answer the copy handoff');
      assert((await session.chats()).every((chat) => chat.text === ''), 'the chat received something');
    },
  },
  {
    name: 'a path Claude Code refuses to mention gives a warning and inserts nothing',
    layout: 'preview of a refused path and one chat tab',
    run: async (session) => {
      await session.clearChats();
      await session.selectInPreview({ action: 'Select', from: 'refuses' });
      await session.press('Meta+L');
      await waitForToast(session, 'cannot @-mention the path refused#name.md');
      assert((await session.chats()).every((chat) => chat.text === ''), 'the chat received something');
    },
  },
];

const SIDE_BAR_CHECKS = [
  {
    name: 'paste, chat in the side bar: pasted, with the status-bar hint',
    layout: 'preview and a side-bar chat',
    run: async (session) => {
      await mentionBoldText(session, 'paste');
      const [chat] = await waitForChats(session, (chats) => chats.length === 1 && hasReference(chats[0]), `the side-bar chat never showed ${reference(4)}`);
      assert(!hasChip(chat), 'the pasted reference was drawn as a chip');
      await waitForStatusHint(session);
      await session.page.waitForTimeout(CLIPBOARD_RESTORE_MS);
    },
  },
  ...['pasteWithFallback', 'claude'].map((mode) => ({
    name: `${mode}, chat in the side bar: delivered by Claude with a chip`,
    layout: 'preview and a side-bar chat',
    changesLayout: true,
    run: async (session) => {
      await mentionBoldText(session, mode);
      await waitForChats(session, (chats) => chats.length === 1 && hasReference(chats[0]) && hasChip(chats[0]), `the side-bar chat never showed ${reference(4)} as a chip`);
    },
  })),
];

const CHECKS = [
  ...fixtureChecks('preview tab', 'preview and one chat tab', 'fixture.md'),
  ...fixtureChecks('Markdown Preview editor', 'Markdown Preview editor and one chat tab', 'plans/plan.md'),
  ...BUTTON_CHECKS, ...DELIVERY_CHECKS, ...NON_BEHAVIOUR_CHECKS, ...FAILURE_CHECKS, ...SIDE_BAR_CHECKS];

function withTimeout(promise, milliseconds) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${milliseconds / 1000} s`)), milliseconds); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function attempt(session, check, state) {
  if (state.layout !== check.layout) {
    state.layout = null;
    await session.writeSettings({});
    await session.resetLayout();
    await LAYOUTS[check.layout](session);
    state.layout = check.layout;
  }
  await check.run(session);
  if (check.changesLayout) state.layout = null;
}

async function runCheck(session, check, index, state) {
  const failures = [];
  for (let attemptNumber = 1; attemptNumber <= 2; attemptNumber += 1) {
    try {
      await withTimeout(attempt(session, check, state), CHECK_TIMEOUT_MS);
      return { check, failures, tookFocus: await session.handFocusBack() };
    } catch (error) {
      if (error instanceof CannotRun) throw error;
      state.layout = null;
      const screenshot = await session.screenshot(`check-${index + 1}-attempt-${attemptNumber}`).catch(() => 'no screenshot');
      failures.push(`${error.message.split('\n')[0]} (${screenshot})`);
    }
  }
  return { check, failures, tookFocus: await session.handFocusBack() };
}

function outcome({ failures }) {
  if (failures.length === 0) return 'ok';
  return failures.length === 1 ? 'FLAKY' : 'FAIL';
}

async function main() {
  let session;
  let savedClipboard = null;
  const results = [];
  try {
    session = await VSCodeSession.launch({ workspaceFiles: WORKSPACE_FILES, settings: SETTINGS, keybindings: OWNER_KEYBINDINGS });
    savedClipboard = await session.readClipboard();
    console.log(`VS Code ${session.versions.vscode}, ${session.versions.claudeCode}; screenshots in ${session.scratch}`);
    const filter = process.argv[2] ?? '';
    const checks = CHECKS.filter((check) => check.name.includes(filter));
    if (checks.length === 0) throw new CannotRun(`no check name contains "${filter}"`);
    if (filter !== '') console.log(`running ${checks.length} of ${CHECKS.length} checks: those whose name contains "${filter}"`);
    const state = { layout: null };
    for (const [index, check] of checks.entries()) {
      const result = await runCheck(session, check, index, state);
      results.push(result);
      const label = outcome(result).padEnd(5);
      console.log(`${label} ${check.name}${result.failures.map((failure, number) => `\n      attempt ${number + 1}: ${failure}`).join('')}`);
    }
  } catch (error) {
    console.log(`CANNOT RUN: ${error instanceof CannotRun ? error.message : error.stack}`);
    process.exitCode = 2;
    return;
  } finally {
    if (savedClipboard !== null) await session.writeClipboard(savedClipboard).catch(() => {});
    if (session) await session.close().catch(() => {});
  }
  const flaky = results.filter((result) => outcome(result) === 'FLAKY');
  const failed = results.filter((result) => outcome(result) === 'FAIL');
  const scope = results.length === CHECKS.length ? 'all' : `ONLY ${results.length} of ${CHECKS.length}`;
  console.log(`\n${scope} checks ran: ${results.length - flaky.length - failed.length} ok, ${flaky.length} flaky, ${failed.length} failed`);
  if (flaky.length > 0) console.log(`FLAKY (failed once, passed on retry): ${flaky.map((result) => result.check.name).join('; ')}`);
  if (session.missedSettingsWrites > 0) console.log(`VS Code missed ${session.missedSettingsWrites} settings change(s); each was rewritten until applied`);
  const focusTakers = results.filter((result) => result.tookFocus);
  if (focusTakers.length > 0) console.log(`TOOK KEYBOARD FOCUS from your app (handed back after the check): ${focusTakers.map((result) => result.check.name).join('; ')}`);
  process.exitCode = failed.length > 0 ? 1 : flaky.length > 0 ? 3 : 0;
  if (process.exitCode === 0) fs.rmSync(session.scratch, { recursive: true, force: true });
  else console.log(`screenshots of every failed attempt are in ${session.scratch}`);
}

main();
