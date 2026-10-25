# Markdown Preview Mention

Select text in a Markdown preview and press **Cmd+L** to mention those source lines in the Claude Code chat, the same way Cmd+L works in a text editor.

> **Unofficial.** This extension is not made by, affiliated with, or endorsed by Anthropic. It works alongside the Claude Code extension.

In a text editor, Claude Code's **Insert @-Mention Reference** command puts a reference such as `@docs/plan.md#12-18` into the chat. That command reads only a text editor's selection, so it does nothing in a Markdown preview. This extension builds the same reference from a preview selection and puts it into the chat input, without opening any editor.

## Requirements

- VS Code 1.143 or later.
- The Claude Code extension (`anthropic.claude-code`). VS Code installs it with this extension if it is missing.
- Tested on macOS only. Windows, Linux and remote workspaces (SSH, WSL, containers) have not been tested.

## Usage

Select text in a Markdown preview, then do either of these:

- Press **Cmd+L** (Ctrl+L on Windows and Linux). The shortcut is active only while a Markdown preview has focus, so Cmd+L in a text editor keeps running Claude Code's own command.
- Click the **@ mention** button that appears beside the selection.

The reference covers every source line the selection touches, including exact lines inside paragraphs, lists, tables and fenced code blocks. It works in both kinds of Markdown preview: the preview tab opened with **Markdown: Open Preview**, and VS Code's newer "Markdown Preview" editor.

## Choosing how the reference is delivered

Claude Code accepts a mention only from a text editor's selection. The setting `markdownPreviewMention.delivery` therefore chooses between never opening an editor and matching Claude Code's own behaviour exactly:

| Value | No editor tab opens | Several visible chats all get it | A chat that is still starting gets it | Highlighted chip |
|---|---|---|---|---|
| `paste` (default) | yes | no, only the focused one | no; a status-bar hint says to press again | no |
| `pasteWithFallback` | only when exactly one chat tab is visible | yes | yes | only when it falls back |
| `claude` | the first press opens the source file beside the preview and leaves it open; later presses reuse it | yes | yes | yes |

When Claude Code's own delivery is used, the source file opens in the group beside the preview, or in a new group at the far right if a Claude chat is showing there, and stays open. While it is visible, a press only moves focus to it for a moment and changes its selection, which is then put back. `pasteWithFallback` counts Claude chats open in editor tabs. A chat in the side bar is not visible to that check, so it always takes the fallback.

## What touches your clipboard

Nothing leaves your machine. The extension makes no network requests, and the reference goes only into the Claude Code chat input on your screen.

It does use the clipboard as a go-between:

- **Cmd+L** runs VS Code's copy command in the preview, and the preview answers that copy with the selected line range instead of the selected text. VS Code gives extensions no other way to read a preview's selection.
- **Pasting** (the `paste` mode, and `pasteWithFallback` when it pastes) puts the reference on the clipboard, focuses the Claude Code chat input and pastes.

After each press, the extension puts your previous clipboard text back. Only plain text is restored: if your clipboard held an image or a list of files, it is lost.

## Limits

- **The reference is plain text when pasted.** The chat input does not draw it as the highlighted chip that Claude Code draws for mentions it inserts itself. The prompt text Claude receives is the same.
- **The reference format is a reimplementation.** The extension reimplements Claude Code's rules for formatting a mention, including quoting a path that contains a space or a colon. They were checked identical to Claude Code 2.1.308 to 2.1.310 on 5,816 real file paths. A Claude Code update that changes those rules would make the two differ until this extension is updated.
- **In `paste` mode, a chat must already be open.** If no Claude chat is open, the press only opens one; press again once it has loaded. With several chats visible, only the one that ends up focused receives the reference.
- **Two quick presses** within one second can leave the first reference on the clipboard instead of your text.
- **A few constructs can shift a line number when they wrap across lines.** Line numbers are exact for paragraphs, lists, tables and code blocks, including inline code spans that wrap (checked on 42,341 lines of real Markdown). The exceptions are image alt text, inline HTML tags and comments, link titles, a `&#10;` entity, backticks inside an autolink, inline `$$…$$` math, math that fails to render, and `$…$` math that swallows a code span. Text that continues after a nested fenced code block inside the same list item comes out one line late.

## Reporting issues

Open an issue at https://github.com/soungrong/vscode-markdown-preview-mention/issues. Please include your VS Code and Claude Code versions and, for a wrong line number, the Markdown that produced it.

## Status: a bridge

This extension works around two missing features. The intended end state is a Claude Code command that accepts a file and a line range. That would insert Claude Code's own chip with no paste, no clipboard use and no reimplemented formatting. The closest upstream request is [anthropics/claude-code#97535](https://github.com/anthropics/claude-code/issues/97535), a command that adds a file to the chat, which would need an optional line range to cover this. VS Code also gives extensions no API to read a preview's selection, so the Cmd+L copy handoff would remain even then.

## Development

```bash
npm install                     # dev dependencies: markdown-it and playwright
npm test                        # unit tests
npm run test:preview            # drives preview.js in headless Chromium over fixture.md's expected references
node test/line-mapping-check.cjs <markdown directory>... [--math "<VS Code>/Contents/Resources/app/extensions/markdown-math"]
```

`test/line-mapping-check.cjs` checks, for every line of every multi-line block in the given Markdown files, that the line maps back to itself. It exits non-zero unless the mapping is exact and both of its deliberately wrong controls fail. `fixture.md` is also the manual check: open it in a preview and follow its "Expected references" list. `docs/use-cases.md` records the use cases and user flows the extension was built for.
