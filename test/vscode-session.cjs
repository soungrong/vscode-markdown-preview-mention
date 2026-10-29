const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('playwright');

const VSCODE_EXECUTABLE = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const USER_EXTENSIONS = path.join(os.homedir(), '.vscode', 'extensions');
const REPOSITORY = path.resolve(__dirname, '..');
const CLAUDE_INPUT = '[contenteditable][role="textbox"]';
const CLAUDE_CHIP = '[class*="inputMentionChip_"]';
// VS Code drops the copy handoff when Cmd+L follows the mouse-up within about 50 ms (docs/backlog.md).
const PAUSE_BEFORE_PRESS_MS = 250;
const SETTINGS_RELOAD_TIMEOUT_MS = 4000;
const SETTINGS_WRITE_ATTEMPTS = 3;
const CLAUDE_CHAT_TIMEOUT_MS = 30000;

class CannotRun extends Error {}

function latestClaudeExtension() {
  const builds = fs.existsSync(USER_EXTENSIONS)
    ? fs.readdirSync(USER_EXTENSIONS).filter((name) => name.startsWith('anthropic.claude-code-'))
    : [];
  if (builds.length === 0) throw new CannotRun(`Claude Code is not installed in ${USER_EXTENSIONS}`);
  return path.join(USER_EXTENSIONS, builds.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1));
}

async function waitUntil(read, isDone, timeout, describe) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (isDone(value)) return value;
    if (Date.now() > deadline) throw new Error(`${describe}; last saw ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

class VSCodeSession {
  static async launch({ workspaceFiles, settings, keybindings }) {
    if (!fs.existsSync(VSCODE_EXECUTABLE)) throw new CannotRun(`VS Code is not installed at ${VSCODE_EXECUTABLE}`);
    const claudeExtension = latestClaudeExtension();
    // VS Code's IPC socket lives in --user-data-dir and must fit in 103 characters, which rules out os.tmpdir().
    const scratch = fs.mkdtempSync('/tmp/markdown-preview-mention-vscode-');
    const workspace = path.join(scratch, 'workspace');
    const extensions = path.join(scratch, 'extensions');
    const userDirectory = path.join(scratch, 'user-data', 'User');
    for (const directory of [workspace, extensions, userDirectory]) fs.mkdirSync(directory, { recursive: true });
    for (const [name, content] of Object.entries(workspaceFiles)) {
      fs.mkdirSync(path.dirname(path.join(workspace, name)), { recursive: true });
      fs.writeFileSync(path.join(workspace, name), content);
    }
    fs.writeFileSync(path.join(userDirectory, 'keybindings.json'), JSON.stringify(keybindings, null, 2));
    fs.symlinkSync(claudeExtension, path.join(extensions, path.basename(claudeExtension)));
    const app = await _electron.launch({
      executablePath: VSCODE_EXECUTABLE,
      args: [
        `--user-data-dir=${path.join(scratch, 'user-data')}`,
        `--extensions-dir=${extensions}`,
        `--extensionDevelopmentPath=${REPOSITORY}`,
        '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
        workspace,
      ],
      env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('ELECTRON_'))),
      timeout: 60000,
    });
    try {
      const page = await app.firstWindow();
      await app.evaluate(({ app, BrowserWindow }) => {
        const [window] = BrowserWindow.getAllWindows();
        window.setOpacity(0);
        window.setIgnoreMouseEvents(true);
        // VS Code calls these to bring itself to the front, for example when it opens a vscode:// link.
        app.focus = () => {};
        window.focus = () => {};
        window.webContents.focus = () => {};
      });
      const session = new VSCodeSession(app, page, scratch, path.join(userDirectory, 'settings.json'), settings);
      await session.handFocusBack();
      await page.locator('.monaco-workbench').waitFor({ timeout: 60000 });
      session.versions = { vscode: await app.evaluate(({ app }) => app.getVersion()), claudeCode: path.basename(claudeExtension) };
      await session.writeSettings({});
      // VS Code misses the first write while its settings watcher starts, every time, so only later misses are news.
      session.missedSettingsWrites = 0;
      return session;
    } catch (error) {
      await app.close().catch(() => {});
      throw error;
    }
  }

  constructor(app, page, scratch, settingsFile, baseSettings) {
    this.app = app;
    this.page = page;
    this.scratch = scratch;
    this.settingsFile = settingsFile;
    this.baseSettings = baseSettings;
    this.settingsVersion = 0;
    this.missedSettingsWrites = 0;
  }

  isFrontmost() {
    const frontmost = execSync('lsappinfo info -only pid "$(lsappinfo front)"').toString().match(/\d+/);
    return frontmost !== null && Number(frontmost[0]) === this.app.process().pid;
  }

  // Hiding and unhiding returns keyboard focus to the user's app; a window left hidden stops taking keyboard input.
  async handFocusBack() {
    if (!this.isFrontmost()) return false;
    await this.app.evaluate(({ app }) => app.hide());
    await this.page.waitForTimeout(300);
    await this.app.evaluate(({ app }) => app.show());
    await this.page.waitForTimeout(300);
    return true;
  }

  async close() {
    await this.app.close();
  }

  async screenshot(name) {
    const file = path.join(this.scratch, `${name}.png`);
    await this.page.screenshot({ path: file });
    return file;
  }

  // The window title carries a marker, so a title showing it proves VS Code has applied this version of the file.
  // VS Code sometimes misses a write entirely, so a missed write is rewritten and counted.
  async writeSettings(overrides) {
    for (let attempt = 1; attempt <= SETTINGS_WRITE_ATTEMPTS; attempt += 1) {
      this.settingsVersion += 1;
      const marker = `settings version ${this.settingsVersion}`;
      fs.writeFileSync(this.settingsFile, JSON.stringify({ ...this.baseSettings, ...overrides, 'window.title': marker }, null, 2));
      const applied = await waitUntil(() => this.page.title(), (title) => title.endsWith(marker), SETTINGS_RELOAD_TIMEOUT_MS, 'missed').then(() => true, () => false);
      if (applied) return;
      this.missedSettingsWrites += 1;
    }
    throw new Error(`VS Code did not apply the settings after ${SETTINGS_WRITE_ATTEMPTS} writes`);
  }

  async openQuickInput(shortcut, text) {
    const input = this.page.locator('.quick-input-widget input');
    for (let attempt = 1; !(await input.isVisible()); attempt += 1) {
      if (attempt > 3) throw new Error(`${shortcut} did not open the quick input for "${text}"`);
      await this.page.keyboard.press(shortcut);
      await input.waitFor({ timeout: 3000 }).catch(() => {});
    }
    await input.fill(text);
    return input;
  }

  async pickQuickInputRow(input, label) {
    const rows = this.page.locator('.quick-input-list .monaco-list-row');
    const labels = await waitUntil(
      () => rows.locator('.quick-input-list-label .label-name').allInnerTexts(),
      (current) => current.includes(label),
      5000,
      `the quick input never offered "${label}"`,
    );
    for (let step = 0; step < labels.indexOf(label); step += 1) await this.page.keyboard.press('ArrowDown');
    const highlighted = await this.page.locator('.quick-input-list .monaco-list-row.focused .quick-input-list-label .label-name').innerText();
    if (highlighted !== label) throw new Error(`the quick input highlighted "${highlighted}" instead of "${label}"`);
    await this.page.keyboard.press('Enter');
    await input.waitFor({ state: 'hidden' });
  }

  async runCommand(title) {
    const input = await this.openQuickInput('Meta+Shift+P', `>${title}`);
    await this.pickQuickInputRow(input, title);
  }

  async openFile(name) {
    const input = await this.openQuickInput('Meta+P', name);
    await this.pickQuickInputRow(input, name);
    await this.page.locator('.editor-group-container .tab.active', { hasText: name }).first().waitFor();
  }

  async resetLayout() {
    await this.page.keyboard.press('Escape');
    await this.runCommand('View: Close All Editor Groups');
    if (await this.page.locator('.part.auxiliarybar').isVisible()) await this.runCommand('View: Toggle Secondary Side Bar Visibility');
    if (await this.page.locator('.part.panel').isVisible()) await this.runCommand('View: Toggle Panel Visibility');
    await this.runCommand('Notifications: Clear All Notifications');
    await waitUntil(() => this.statusBarText(), (text) => !text.includes('Markdown Preview Mention'), 8000, 'an old status-bar hint never cleared');
  }

  async framesContaining(selector) {
    const matches = [];
    for (const frame of this.page.frames()) {
      if (await frame.$(selector).catch(() => null)) matches.push(frame);
    }
    return matches;
  }

  async claudeFrames() {
    return this.framesContaining(CLAUDE_INPUT);
  }

  async waitForClaudeChats(count) {
    try {
      return await waitUntil(() => this.claudeFrames(), (frames) => frames.length >= count, CLAUDE_CHAT_TIMEOUT_MS, `expected ${count} Claude chat inputs`);
    } catch (error) {
      if (count === 1) throw new CannotRun(`no Claude chat input appeared within ${CLAUDE_CHAT_TIMEOUT_MS / 1000} s; is Claude Code signed in? (${error.message})`);
      throw error;
    }
  }

  async previewFrame() {
    const [frame] = await waitUntil(() => this.framesContaining('.markdown-body'), (frames) => frames.length === 1, 15000, 'expected exactly one Markdown preview');
    return frame;
  }

  async chats() {
    const states = [];
    for (const frame of await this.claudeFrames()) {
      states.push({
        text: (await frame.locator(CLAUDE_INPUT).first().innerText()).trim(),
        chips: (await frame.locator(CLAUDE_CHIP).allInnerTexts()).map((chip) => chip.trim()),
      });
    }
    return states;
  }

  async clearChats() {
    for (const frame of await this.claudeFrames()) {
      const input = frame.locator(CLAUDE_INPUT).first();
      if (!(await input.isVisible()) || (await input.innerText()).trim() === '') continue;
      await input.click();
      await this.page.keyboard.press('Meta+A');
      await this.page.keyboard.press('Backspace');
    }
  }

  async tabGroups() {
    return this.page.locator('.editor-group-container').evaluateAll((groups) => groups.map((group) => {
      const tabs = [...group.querySelectorAll('.tabs-container .tab')];
      const label = (tab) => tab.getAttribute('aria-label').split(',')[0];
      return { tabs: tabs.map(label), active: tabs.filter((tab) => tab.classList.contains('active')).map(label)[0] ?? null };
    }));
  }

  async toasts() {
    return this.page.locator('.notifications-toasts .notification-list-item-message').allInnerTexts();
  }

  async statusBarText() {
    return this.page.locator('.part.statusbar').innerText();
  }

  async dialogText() {
    const dialog = this.page.locator('.monaco-dialog-box');
    return (await dialog.isVisible()) ? dialog.innerText() : null;
  }

  async readClipboard() {
    return this.app.evaluate(({ clipboard }) => clipboard.readText());
  }

  async writeClipboard(text) {
    await this.app.evaluate(({ clipboard }, value) => clipboard.writeText(value), text);
  }

  async selectInPreview({ action, from, to = from }) {
    const preview = await this.previewFrame();
    await preview.evaluate(() => document.getSelection().removeAllRanges());
    await this.page.waitForTimeout(250);
    const points = await preview.evaluate(({ from, to }) => {
      const body = document.querySelector('.markdown-body');
      const nodes = [];
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      let text = '';
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        nodes.push({ node, start: text.length });
        text += node.data;
      }
      const fromOffset = text.indexOf(from);
      const toOffset = text.indexOf(to, fromOffset);
      if (fromOffset < 0 || toOffset < 0) return null;
      const characterRect = (offset) => {
        const entry = nodes.findLast((candidate) => candidate.start <= offset);
        const range = document.createRange();
        range.setStart(entry.node, offset - entry.start);
        range.setEnd(entry.node, offset - entry.start + 1);
        return range.getClientRects()[0];
      };
      const fromEntry = nodes.findLast((candidate) => candidate.start <= fromOffset);
      fromEntry.node.parentElement.scrollIntoView({ block: 'center', behavior: 'instant' });
      const first = characterRect(fromOffset);
      const last = characterRect(toOffset + to.length - 1);
      return {
        start: { x: first.left + 1, y: (first.top + first.bottom) / 2 },
        end: { x: last.right - 1, y: (last.top + last.bottom) / 2 },
      };
    }, { from, to });
    if (points === null) throw new Error(`the preview does not contain "${from}" followed by "${to}"`);
    const frameBox = await (await preview.frameElement()).boundingBox();
    const start = { x: frameBox.x + points.start.x, y: frameBox.y + points.start.y };
    const end = { x: frameBox.x + points.end.x, y: frameBox.y + points.end.y };
    if (action === 'Triple-click') {
      await this.page.mouse.click(start.x, start.y, { clickCount: 3 });
    } else {
      await this.page.mouse.move(start.x, start.y);
      await this.page.mouse.down();
      await this.page.mouse.move(end.x, end.y, { steps: 10 });
      await this.page.mouse.up();
    }
    const selected = (await preview.evaluate(() => document.getSelection().toString())).trim();
    const landed = action === 'Triple-click' ? selected.includes(from) : selected.startsWith(from) && selected.endsWith(to);
    if (!landed) throw new Error(`the test's drag missed: it selected ${JSON.stringify(selected.slice(0, 80))} instead of "${from}" to "${to}"`);
    return preview;
  }

  async press(shortcut) {
    await this.page.waitForTimeout(PAUSE_BEFORE_PRESS_MS);
    await this.page.keyboard.press(shortcut);
  }
}

module.exports = { CLAUDE_INPUT, CannotRun, REPOSITORY, VSCodeSession, waitUntil };
