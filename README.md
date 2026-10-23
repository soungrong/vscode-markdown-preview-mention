# preview-mention

A local VS Code extension that puts a Claude Code @-mention for the lines selected in a Markdown preview into the Claude chat input. In a text editor, **Claude Code: Insert @-Mention Reference** (`claude-vscode.insertAtMention`) inserts a reference such as `@docs/plan.md#12-18` into the open chat. That command reads only a text editor's selection, so it does nothing in a preview. preview-mention builds the same reference text from a preview selection and pastes it into the chat input, without opening any editor.

It works in both kinds of Markdown preview: the classic preview tab and VS Code's newer "Markdown Preview" editor.

## Using it

Select text in a Markdown preview, then do either of these:

- Press **Cmd+L** (Ctrl+L elsewhere). The binding is active only while a Markdown preview has focus, so Cmd+L in a text editor keeps running Claude's own command.
- Click the **@ Claude button** that appears beside the selection.

The reference covers every source line the selection touches, including exact lines inside paragraphs and fenced code blocks.

`docs/use-cases.md` records the use cases and user flows this extension was built for.

## Choosing how the reference is delivered

Claude Code only accepts a mention from a text editor's selection, so the setting `markdownPreviewMention.delivery` picks between avoiding any editor tab and matching Claude's own behaviour exactly:

| Value | No editor tab flashes | Several visible chats all get it | A chat that is still starting gets it | Highlighted chip |
|---|---|---|---|---|
| `paste` (default) | yes | no, only the focused one | no; a status-bar hint says to press again | no |
| `pasteWithFallback` | only when exactly one chat tab is visible | yes | yes | only when it falls back |
| `claude` | the first press opens the source file beside the preview and leaves it open; later presses reuse it | yes | yes | yes |

When Claude Code's own delivery is used, the source file opens in the group beside the preview, or in a new group at the far right if a Claude chat is showing there, and stays open. While it is visible, a press only moves focus to it for a moment and changes its selection, which is then put back. `pasteWithFallback` counts Claude chats open in editor tabs. A chat in the side bar is not visible to that check, so it always takes the fallback.

## Installing

The extension is installed as a symlink, so it runs straight from this folder:

```bash
ln -s ~/workspace/tools/preview-mention ~/.vscode/extensions/soungrong.preview-mention-0.0.1
```

A running VS Code window registered the symlinked folder in `~/.vscode/extensions/extensions.json` within a minute of the link being created (observed 2026-10-23). `code --list-extensions` run seconds after the `ln` did not list it yet, so wait before concluding it failed. After any change to the files here, run **Developer: Reload Window** in each open VS Code window.

Do not delete the symlink while VS Code still has the extension registered. That leaves a registry entry with no folder, and `code --install-extension` then refuses with "Please restart VS Code before reinstalling Preview Mention".

## How it works

The preview script (`preview.js`) maps the selection to source lines using the `data-line` attribute that VS Code puts on every rendered block, plus the number of line breaks between the block's start and the selection. The extension host (`extension.js`) reads the source file without showing it and formats the reference exactly as Claude does (`mention-reference.js`), including quoting a path that contains a space or a colon. It then puts the reference on the clipboard, runs **Claude Code: Focus input** (`claude-vscode.focus`), pastes into the chat input, and puts your clipboard text back one second later.

The preview script has no direct way to talk to the extension, so each trigger takes a detour:

- **Cmd+L** runs VS Code's copy command into the preview, and the preview script answers that copy with the line range instead of the selected text. The extension reads the range from the clipboard.
- **The @ Claude button** is a `vscode://soungrong.preview-mention/insert?payload=…` link, which VS Code hands to the extension's URI handler.

## Limits

- The reference is pasted as plain text, so the chat input does not draw it as the highlighted chip Claude uses for mentions it inserts itself. The prompt text Claude receives is the same.
- Both triggers use the clipboard and restore only plain text. A copied image or file list is lost.
- `mention-reference.js` is a copy of Claude Code's formatting rules (checked identical to 2.1.309 on 5,816 paths). A Claude Code update that changes them would make the two differ until the copy is updated.
- In `paste` mode, if no Claude chat is open the press only opens one; press again once it has loaded. With several chats visible, only the one that ends up focused receives the reference.
- Pressing Cmd+L twice within one second can leave the first reference on the clipboard instead of your text.
- Line numbers are exact for paragraphs, lists, tables and code blocks, including inline code spans that wrap across lines (checked on 42,341 lines of real Markdown). These constructs can still shift a line when they wrap across lines: image alt text, inline HTML tags and comments, link titles, a `&#10;` entity, backticks inside an autolink, inline `$$…$$` math, math that fails to render, and `$…$` math that swallows a code span. Text that continues after a nested fenced code block inside the same list item comes out one line late.

## Status: a bridge

This is a workaround for two missing features. The intended end state is a `claude-vscode.insertAtMention` that accepts a file and a line range as arguments. That would insert Claude's own chip with no paste, no clipboard use and no copy of Claude's formatting rules. VS Code also gives extensions no API to read a preview's selection, so the Cmd+L copy handoff would remain. The closest upstream request is `anthropics/claude-code#97535` (a command that adds a file to the chat), which would need an optional line range to cover this.

## Testing

```bash
npm install                     # dev dependencies: markdown-it and playwright
npm test                        # unit tests
npm run test:preview            # drives preview.js in headless Chromium over fixture.md's expected references
node test/line-mapping-check.cjs <markdown directory>... [--math "<VS Code>/Contents/Resources/app/extensions/markdown-math"]
```

`test/line-mapping-check.cjs` checks, for every line of every multi-line block in the given Markdown files, that the line maps back to itself. It exits non-zero unless the mapping is exact and both of its deliberately wrong controls fail.

`fixture.md` is also the manual check: open it in a preview and follow its "Expected references" list.
