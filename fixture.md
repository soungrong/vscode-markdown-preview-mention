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

Open this file in a Markdown preview, make each selection, press Cmd+L, and compare the reference inserted into the chat. Every reference ends `fixture.md#<lines>`. `npm run test:preview` makes the same selections automatically.

1. Select "three source lines" on the paragraph's first line: `#3`.
2. Drag from "second line" to "third line": `#4-5`.
3. Select "bold text": `#4`.
4. Triple-click "three source lines" in the paragraph: `#3-5`.
5. Select "Nested item one": `#9`.
6. Drag from "Second item" to "Nested item two": `#8-10`.
7. Select "second = 2" in the code block: `#14`.
8. Drag from "first = 1" to "third = 3" in the code block: `#13-15`.
9. Select "b1" in the table: `#20`.
10. Drag from "a1" to "b2" in the table: `#20-21`.
11. Drag from "Markdown Preview Mention fixture" to "three source" in the paragraph: `#1-3`.
12. Drag from "origins (harmless, remove)." to "Ondřej" in the backlog excerpt: `#30-31`.
13. Select "The next daily run", just after the wrapped code span: `#27`.
14. Select "reinstalled", inside the wrapped code span after its line break: `#27`.
15. Select "E: The package", inside the wrapped code span before its line break: `#26`.
16. Drag from "un-wedged apt" to "subset unattended": `#26-27`.
