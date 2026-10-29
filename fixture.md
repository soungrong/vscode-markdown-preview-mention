# Markdown Preview Mention fixture

This paragraph has three source lines.
The second line carries **bold text**
and the third line ends it.

- First item
- Second item
  - Nested item one
  - Nested item two

```js
const first = 1;
const second = 2;
const third = 3;
```

| Column A | Column B |
| -------- | -------- |
| a1       | b1       |
| a2       | b2       |

## Real case: wrapped code span

- **350 Ubuntu upgrades now pending, and unattended-upgrades works again.** Purging the half-installed
  `runcloud-agent` un-wedged apt (it refused every install with `E: The package runcloud-agent needs to be
  reinstalled`). The next daily run will install the security-pocket subset unattended; a kernel among them
  needs a reboot. Size: 350 packages, six months of OS patches. Where: `/var/log/unattended-upgrades/`. Why
  left: expected side effect (plan Unknown 3); check the log after the next run and schedule a reboot.
  The same allowed-origins list still names dead `RunCloud:` and `MariaDB:` origins (harmless, remove).
- **Ondřej's PPA is migrating to packages.sury.org.** `add-apt-repository` printed: "This repository is in
  process of being merged into https://packages.sury.org/php/ … I will provide a simple way how to migrate".
  Size: automatic 8.3.x patching stops silently if the PPA stops publishing. Where:
  `/etc/apt/apt.conf.d/51fleet-ondrej-php` (origin `LP-PPA-ondrej-php`) and the PPA source. Why left: the
  migration path is not published yet; revisit when it is.

## Expected references

Each step selects some text in the Markdown preview, presses Cmd+L, and checks the reference that arrives in the Claude chat. `npm run test:preview` makes the same selections automatically in headless Chromium, and `npm run test:vscode` makes them with the mouse in real VS Code.

### Setting up

- Open this file in a text editor with line numbers showing. You only read line numbers there; you do not select anything in it.
- Run **Markdown: Open Preview to the Side** (Cmd+K V). Make every selection in this preview.
- Open a Claude Code chat. With the default `paste` delivery, the reference goes into the chat that is already open.

### Reading a step

- **The words in quotes are text in this file, not a description of it.** For example, "three source lines" is the phrase at the end of line 3, and "second line" is the phrase in the middle of line 4. The paragraph under the title describes its own lines, which is why its words sound like instructions.
- **Select "X"** means highlight exactly the phrase X.
- **Drag from "X" to "Y"** means press the mouse just before the first letter of X, drag, and release just after the last letter of Y. The selection covers both phrases and everything between them.
- **Triple-click "X"** means triple-click any word of X, which selects the whole paragraph.
- After each selection, press Cmd+L while the preview still has focus. The reference in the chat should end in `fixture.md#` followed by the number at the end of the step. `#4-5` means lines 4 to 5 of this file.

### What a line number counts

A line number is a line of this file as numbered in the text editor's gutter, which is the text between two presses of Return. The editor may wrap a long line across several rows on screen. Those rows share one gutter number, so they count as one line.

The preview, on the other hand, joins all the lines of a paragraph or a list item into one block and re-wraps it to the window width. The preview therefore never shows where a line ends. Each step names the line its phrases sit on, so you can find them in the text editor beside the preview.

### The paragraph (lines 3 to 5)

In the preview, lines 3, 4 and 5 read as one run of text: "This paragraph has three source lines. The second line carries **bold text** and the third line ends it."

1. Select "three source lines" (the end of line 3): `#3`.
2. Drag from "second line" to "third line" (the middle of line 4 to the middle of line 5): `#4-5`.
3. Select "bold text" (the end of line 4): `#4`.
4. Triple-click "three source lines" (line 3), which selects the whole paragraph: `#3-5`.

### The list (lines 7 to 10)

5. Select "Nested item one" (line 9): `#9`.
6. Drag from "Second item" to "Nested item two" (line 8 to line 10): `#8-10`.

### The code block (lines 12 to 16)

7. Select "second = 2" (line 14): `#14`.
8. Drag from "first = 1" to "third = 3" (line 13 to line 15): `#13-15`.

### The table (lines 18 to 21)

9. Select "b1" (line 20): `#20`.
10. Drag from "a1" to "b2" (line 20 to line 21): `#20-21`.

### Across two blocks

11. Drag from "Markdown Preview Mention fixture" to "three source" (the title on line 1 to the paragraph on line 3): `#1-3`.

### The wrapped code span (lines 25 to 35)

Lines 25 to 35 are two list items copied from a real backlog. These lines are long, so the text editor may wrap each one across several rows; go by the gutter numbers. The code span `E: The package runcloud-agent needs to be reinstalled` starts at the end of line 26 and continues at the start of line 27, although the preview shows it unbroken.

12. Drag from "origins (harmless, remove)." to "Ondřej" (the end of line 30, the first item's last line, to the start of line 31, the second item's first line): `#30-31`.
13. Select "The next daily run" (line 27, just after the code span ends): `#27`.
14. Select "reinstalled" (the start of line 27, the code span's last word): `#27`.
15. Select "E: The package" (the end of line 26, the code span's first words): `#26`.
16. Drag from "un-wedged apt" to "subset unattended" (line 26 to line 27): `#26-27`.

### Scroll position in `claude` delivery mode

This check needs `"markdownPreviewMention.delivery": "claude"`, `editor.stickyScroll.enabled` on (the default), and the text editor for this file visible beside the preview.

- Scroll the preview with the trackpad until a long paragraph, such as the one at line 91, is partly above the top of the preview. The text editor follows.
- Select a few words in that paragraph and press Cmd+L. Neither the preview nor the text editor should move.
- Select a few words again and click the "@ mention" button. Again, neither the preview nor the text editor should move.
