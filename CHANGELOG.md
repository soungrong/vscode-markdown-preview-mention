# Changelog

## Unreleased

- In `claude` delivery mode, a mention no longer scrolls the preview and its source editor. The extension used to restore the editor's scroll position after Claude Code read the selection, and with sticky scroll on, that restore moved the editor up by up to five lines, and the preview followed.

## 0.1.0

First public release.

- Cmd+L (Ctrl+L on Windows and Linux) in a Markdown preview puts a Claude Code @-mention for the selected source lines into the chat input.
- An "@ mention" button beside the selection does the same.
- The `markdownPreviewMention.delivery` setting chooses between pasting the reference (`paste`, the default), pasting with a fallback to Claude Code's own delivery (`pasteWithFallback`), and always using Claude Code's own delivery (`claude`).
