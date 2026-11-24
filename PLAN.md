# annot: plan

A Chrome extension for marking up any page (agent-generated HTML plans, localhost apps, hosted apps behind SSO), plus a CLI that Claude and Codex use to read the marks and reply. It's a channel between me and my agents, built to be fast and stay out of the way.

## v1 scope

In:
- Toggle annotate mode with ⌥A or the toolbar icon.
- **Drag** to place a box, then type. Enter saves, Shift+Enter adds a new line, Esc cancels.
- **Shift+drag** draws freehand (circle, underline, arrow). If you type right after a stroke, the text attaches to it.
- Click a mark (or its bubbles) to edit its note; once the agent has replied, what you type is a follow-up added to the mark's thread. Delete removes the mark.
- Each save also stores a screenshot of the viewport with the marks visible.
- Marks are numbered per page. Corner bar (Bubbles style, kept small): filter **Open / All**, ‹ › to scroll to the previous/next mark in page order (its number pulses once the scroll stops), a color dot that opens a 2D picker (hue across, light to dark down) plus recently used colors, and **Clear** (delete every mark on the page, after a confirmation).
- ⌘Z: while drawing, removes the last stroke; otherwise undoes the last save, delete or Clear on the page, one step at a time. It's refused if the mark changed since (an agent replied), so a reply is never lost. Typing in a note keeps its own undo.
- Marks follow their element: each is drawn offset by how far its first recognisable element (`elements`, by selector; tag and text must match unless the selector is an id or test id) has moved since it was saved. The saved mark isn't changed. The overlay rechecks every half second.
- Coming back to the tab or to Chrome reloads the page's marks (annotate mode on) and updates the toolbar icon's count.
- The toolbar icon (a pen nib in a rounded square) is a gray outline, and a solid orange tile while annotate mode is on in that tab. The page's open-mark count is drawn into its corner (white on orange when off, white on ink when on), not with Chrome's badge, which can't be made smaller. The overlay tells the background when it turns on or off; otherwise the background asks it. Chrome resets per-tab icons when a new document loads, not on pushState or #hash.
- When annotate mode is off, marks are hidden.
- Agents: `annot pull` and `annot resolve <id> "one-line reply"`.

Out (for now): sharing, agents placing marks, any chat UI, the proxy, hooks that push feedback into a session, browsers other than Chrome, mapping marks to source files.

## Architecture

```
page ── overlay.js (content script, Shadow DOM, SVG)
          │ chrome.runtime messages
        background.js (service worker: toggle, screenshot, toolbar icon)
          │ chrome.runtime.sendNativeMessage
        bin/annot-host  →  node bin/annot.js   (native messaging host)
          │ fs
        ~/.annotations/<host>/<id>.json + <id>.png
          │ fs
        annot pull / annot resolve  (same script, run as a CLI by agents)
```

Stack: plain JS with no build, and Node 24 with no dependencies. The repo folder is loaded into Chrome as an unpacked extension.

## Repo layout

```
annot/
  extension/
    manifest.json     MV3; fixed "key" so the extension ID stays stable
    background.js
    shapes.js         stroke geometry → circle / underline / arrow / drawing (no DOM, unit-tested)
    overlay.js
  bin/
    annot.js          CLI + native host (native mode when argv[2] starts with chrome-extension://)
  lib/
    store.js          read/write marks, pull state
  test/
    store.test.js     node:test
    shapes.test.js    node:test, including a real hand-drawn arrow (fixtures/arrow.json)
    smoke.test.js     Playwright: load extension, draw box, circle, arrow, underline; assert files on disk
  install.sh          ./install.sh host | <profile>
  skill.md            agent skill
  README.md
```

## Data

One file per mark: `~/.annotations/<host>/<id>.json`, with `<id>.png` alongside. Host is `localhost:5173`, `app.example.com`, or `file` for local plans. To show marks on a page, the extension asks for the host directory and filters by URL path. Per-mark files mean the extension and the CLI never write the same file at once.

```json
{
  "id": "mfx3k9a2",
  "n": 4,
  "url": "http://localhost:5173/projects/42?tab=experts",
  "title": "Project 42 · Experts",
  "kind": "box",
  "shape": "box",
  "color": "#ff6a3d",
  "text": "this column should be sortable",
  "status": "open",
  "thread": [
    { "from": "agent", "text": "Made Last call sortable", "at": "2026-11-23T21:20:02.000Z" },
    { "from": "user", "text": "default to newest first", "at": "2026-11-23T21:31:40.000Z" }
  ],
  "created": "2026-11-23T21:04:11.000Z",
  "updated": "2026-11-23T21:04:11.000Z",
  "viewport": { "w": 1512, "h": 857, "dpr": 2, "scrollX": 0, "scrollY": 640 },
  "box": { "x": 220, "y": 980, "w": 300, "h": 120 },
  "strokes": null,
  "elements": [
    { "selector": "table.experts th:nth-of-type(3)", "tag": "th", "text": "Last call", "rect": { "x": 230, "y": 990, "w": 140, "h": 32 } }
  ],
  "capture": "mfx3k9a2.png"
}
```

- `box` and `strokes` use page coordinates (relative to the document, not the viewport). For a drawing, `kind` is `"stroke"`, `strokes` is `[[[x,y],...], ...]` (consecutive Shift-drags build one drawing, e.g. an arrow's shaft and head) and `box` is their bounding box, so the element lookup handles both kinds the same way.
- `shape` is worked out on save by `extension/shapes.js` from the strokes alone: `box` (dragged box), `circle` (one stroke whose ends meet), `underline` (one flat, wide stroke), `arrow` (one stroke, or a longest stroke plus shorter strokes; the shorter ones mark which end of the longest is the tip, so drawing order doesn't matter), or `drawing` (anything else). Each shape sets its own target in `elements`:
  - box, circle, drawing: the elements inside `box`, as below.
  - underline: the elements in a band just above the line, plus `quote`, the exact text above the line (read with `caretPositionFromPoint`).
  - arrow: `tip: { x, y, dx, dy }`. From the tip, walk in the direction it points and take the first control (link, button, input…) or text-bearing element hit, skipping layout containers. If nothing is hit, use the elements around the tip.
- `elements` for an area: of all elements whose rectangles overlap it, keep the innermost ones (drop any element that has a descendant also in the set), drop ones more than 4× the area's size unless nothing else is left, and drop duplicates. Rank by overlap and keep 5. Each element's text is trimmed to 200 characters. Selector: a unique `#id`, else `[data-testid]`, else tag plus up to two classes plus `:nth-of-type`, walking up at most 4 levels. Selectors may not be unique; the text and rect tell them apart.
- `n` is the next number for that page. `id` is the timestamp in base36 plus random characters.
- `text` is the original note and isn't rewritten once the agent has replied. `thread` holds everything after it, oldest first: agent replies (from `annot resolve`) and the user's follow-ups (a save with `followUp`, which also reopens the mark). Marks saved before threads existed had a single `reply`; they're read as a one-entry thread.
- Deleting a mark, or saving a new capture over an old one, moves the old PNG to `<host>/.trash/` so undo can bring it back. The extension keeps the undo history in memory for the page; the trash is emptied when Chrome starts (the `clear-drafts` op).
- `color` is the mark's color (hex), chosen in the picker; the extension keeps the current color and recently used colors in `chrome.storage.local`.

## Pull

`~/.annotations/<host>/.state.json` holds `{ lastPull }` for each host. There are no rounds: marking up and pulling is one continuous process.

- `annot pull [url-prefix]` prints the open marks as JSON, adding `"new": true` to any whose `updated` is later than `lastPull`, plus `file` (the mark's JSON path). Raw `strokes` are left out of the output. It then sets `lastPull` for each host it covered. You can pull at any time. If the store isn't writable (a sandboxed agent), the pull still prints but isn't recorded.
- `annot pull --all` also includes resolved marks.
- `annot resolve <id> "<reply>"` sets `status: "resolved"` and `updated`, and adds the reply to `thread`.
- A follow-up (or editing the text of a resolved mark that has no replies) reopens it.

## Native messaging

Requests go from the extension to the host with `chrome.runtime.sendNativeMessage`; Chrome starts a new process for each message, so nothing runs in the background.

| op | payload | returns |
|---|---|---|
| `list` | `{ url }` | marks for that host and path |
| `save` | mark (new or edited, optionally with `followUp`) + `capture` as a base64 PNG | saved mark |
| `delete` | `{ url, id }` | `{ ok }` |
| `clear` | `{ url }` | `{ cleared }`: deletes every mark on that page |
| `restore` | `{ changes: [{ url, id, before, after }] }` | undo: writes each mark back as `before` (or removes it if null), only if its `updated` still equals `after` (null: still deleted); all or nothing |
| `hosts` | none | hosts that have marks; the background script uses it to skip the native call when updating the toolbar icon's count on ordinary pages |

Responses stay under the 1 MB limit for messages from the host because PNGs are never sent back to the extension.

## Install

`./install.sh host`:
1. Writes `bin/annot-host`, which runs `exec ~/.local/share/fnm/aliases/default/bin/node <repo>/bin/annot.js "$@"`. Chrome starts it without your shell's PATH, and the `node` on PATH is a temporary per-shell path from fnm, so the absolute path is needed.
2. Writes `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.asaeed.annot.json`, with `allowed_origins` set to the fixed extension ID.
3. Symlinks `~/.local/bin/annot` → `bin/annot.js`.

`./install.sh <claude|codex>` copies `skill.md` to `~/.claude/skills/annot/SKILL.md` or `~/.codex/skills/annot/SKILL.md` (the author's extra profiles `claude-work` and `codex-work` work too). The skill is triggered by phrases like "check my annotations": run `annot pull`, read each mark's text, elements and capture, act on it, then `annot resolve <id> "<reply>"`.

Once, by hand: open chrome://extensions, turn on Developer mode, Load unpacked → `extension/`, and switch on "Allow access to file URLs".

## Build order

Each step ends with something I can check.

1. `lib/store.js` + `annot pull/resolve` with node:test. Check: hand-written JSON files pull and resolve correctly.
2. Native host mode + `install.sh host`. Check: a framed stdin message round-trips.
3. Extension: toggle, box, type, save. Check: a `.json` file appears for a localhost page and a file:// plan. **First usable version.**
4. Element capture + screenshot. Check: `elements` and the PNG make sense on a real app.
5. Freehand strokes.
6. Show existing marks, filter, edit/delete, badge, display of the agent's replies.
7. `skill.md`, README, Playwright smoke test, install into all four profiles.
8. Create the public GitHub repo (only after you confirm).
9. Before wrapping up development: remove the dev self-reload in `background.js` (the block marked `shortcut:`) and restore the README's "click reload on chrome://extensions" line. It lets a file change on disk take effect without a click, which a released extension shouldn't do.

## Risks and findings

- Verified in the smoke test: the manifest `key` gives a stable extension ID; `captureVisibleTab` works with `<all_urls>`; native messaging works end to end.
- Native host manifests must include `description`, or Chrome reports "host not found". Chromium also reads hosts from `<user-data-dir>/NativeMessagingHosts`, which the smoke test uses to keep a temp store.
- Not yet verified: capture and injection on file:// pages (needs "Allow access to file URLs"), and pages with strict CSP. The overlay uses CSSOM (`adoptedStyleSheets`, `style.cssText`), which CSP doesn't block.
- Known limits: marks follow moves of their element, not resizes. Marks over sticky headers, inside scrolling sub-panels, iframes, shadow DOM or canvas apps, or whose element is gone, stay where they were drawn. The element data still tells the agent what was meant. The toolbar icon's count updates on page load, when the overlay opens, and when you switch to the tab or window, not the moment an agent resolves a mark.
