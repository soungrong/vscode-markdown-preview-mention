# Use cases and user flows

This document records what Markdown Preview Mention is for and how each flow is expected to behave. Each flow ends with the check that proves it, so it doubles as the acceptance list for a release.

## The problem it solves

Claude Code's VS Code extension has a command, **Claude Code: Insert @-Mention Reference** (`claude-vscode.insertAtMention`), that inserts a reference such as `@docs/plan.md#12-18` into the Claude chat for the lines selected in a text editor. People who read plans, specs and notes in VS Code's rendered Markdown preview cannot use it there: the command reads only a text editor's selection, and the preview is a webview, so the shortcut does nothing.

The extension exists so that a reader can stay in the rendered preview, select what they want to talk about, and get the same reference into the chat as if they had selected it in the source.

The motivating case: Claude Code plans open in the Markdown preview by a `workbench.editorAssociations` setting (`"**/.claude/plans/*.md": "vscode.markdown.preview.editor"`). Reviewing a plan means reading it rendered and pointing Claude at specific lines.

## Who it is for

- People who use the Claude Code extension in VS Code and read Markdown in the preview rather than the editor.
- People who already use Cmd+L (or Alt+K) in a text editor to mention lines, and expect the same key to work in the preview.

## Flows

### 1. Mention selected lines with the keyboard

1. Open a Markdown file in a preview: either the classic preview tab ("Markdown: Open Preview") or VS Code's "Markdown Preview" editor.
2. Select text by dragging, double-clicking or triple-clicking.
3. Press **Cmd+L** (Ctrl+L on Windows and Linux).

Expected: the Claude chat input gets the reference Claude itself would insert for those source lines, for example `@docs/plan.md#4-5 `, or `@"Daily/todo 2026-06-30.md#5-10" ` when the path has a space.

The reference covers every source line the selection touches. It is exact inside paragraphs, list items, tables and fenced code blocks, and across inline code spans that wrap across lines.

Check: `npm run test:preview` passes all rows of `fixture.md`'s "Expected references" list; by hand, our Cmd+L in the preview and Claude's own Cmd+L in the text editor insert identical text for the same selection.

### 2. Mention selected lines with the mouse

1. Select text in a preview.
2. Click the floating **@ mention** button that appears beside the selection.

Expected: the same reference as flow 1. The first click on a new install may show VS Code's "Allow … to open this URI?" dialog; after allowing it once, clicks go straight through.

### 3. Choose how the reference reaches the chat

Claude Code accepts a mention only from a text editor's selection, so the setting `markdownPreviewMention.delivery` trades no editor activity against exact parity with Claude:

- **`paste` (default).** The reference is pasted into the focused chat input as plain text. No editor ever opens.
- **`pasteWithFallback`.** Paste when exactly one Claude chat tab is visible. Otherwise use Claude's own delivery (the next item).
- **`claude`.** Always use Claude's own delivery. The first press opens the source file in the group beside the preview and leaves it open. Later presses reuse that editor and only change its selection briefly. The result is exactly what Cmd+L in the editor does, including the highlighted chip.

Expected behaviour in the situations users raised:

| Situation | `paste` | `pasteWithFallback` | `claude` |
|---|---|---|---|
| One Claude chat tab visible | pasted, no editor opens | pasted, no editor opens | delivered by Claude, chip shown |
| No chat open | a new chat opens but stays empty; a status-bar hint says to press again | a new chat opens with the reference | a new chat opens with the reference |
| Several chats visible | only the focused one gets it | every visible chat gets it | every visible chat gets it |
| Chat in the side bar | pasted, with the status-bar hint | always falls back to Claude's delivery | delivered by Claude |

### 4. Nothing else changes

These are deliberate non-behaviours, each checked by hand before a release:

- After a press, the text that was on the clipboard before is back on the clipboard. Only plain text is restored: a copied image or file list is lost.
- A plain Cmd+C in the preview still copies the selected text.
- Cmd+L in a text editor still runs Claude's own command; the extension's binding applies only while a Markdown preview has focus.
- With the preview open but focus in the Explorer or a panel, Cmd+L does nothing.
- In `paste` mode no tab opens or closes. In the other modes, no tab is ever closed, and the source never opens over the preview or over a visible Claude chat.

### 5. Failures are reported, not silent

- Cmd+L with nothing selected shows "select some text in the preview first".
- If the preview script is not loaded (for example before a window reload), Cmd+L shows a warning after one second instead of doing nothing.
- A path Claude Code refuses to mention (for example one containing `#`) shows a warning and inserts nothing.

## Out of scope

- Mentioning from other webviews (notebook output, diff views, custom editors). The same technique could work, but only Markdown previews are supported.
- Inserting a real chip without any editor activity. That needs Claude Code to accept a file and line range in `insertAtMention`; the closest upstream request is `anthropics/claude-code#97535`.
