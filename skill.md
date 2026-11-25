---
name: annot
description: Read and resolve the user's annot marks, which are boxes, drawings (circles, arrows, underlines) and notes they placed on web pages, HTML plans and running apps with the annot browser extension. Use when the user says "pull my annotations", "check my annotations", "pull annot", "see my marks/notes on the page", or refers to numbered marks on a page.
---

# annot

The user marks up pages in their browser. Each mark is a box or a freehand drawing, usually with a note, saved as JSON under `~/.annotations/`. You read them with the `annot` CLI and reply by resolving them.

## Loop

1. `annot pull [url-prefix]` prints open marks and in-progress drafts as JSON. Narrow it with a prefix when you know the page (`localhost:5173`, `localhost:5173/projects`, or a plan's file path). Pull whenever the user asks what they just marked. Use drafts to identify the latest target, including before Enter is pressed. A draft has `status: "draft"` and can be read but cannot be resolved.
2. For each mark, work out what the user means:
   - `text` is the original note. `n` is the number shown on the page ("#3").
   - `thread` is the conversation since, oldest first: `{ from: "agent" | "user", text, at }`. Your earlier replies are there; if the last entry is from the user, that follow-up is the current ask, read in light of the original note and your replies.
   - `kind` is `box` (a dragged box: what's inside it) or `stroke` (a freehand drawing). annot doesn't say what a drawing is. Look at the `capture` to see whether it circles something, underlines it, points at it or is something else, and read it the way a person would: an arrow means what it points at, not what its line crosses.
   - `capture` is the absolute path of a PNG of the viewport with the mark drawn on it. Always look at it for a drawing; for a box, when text plus elements leave doubt.
   - `elements` are the DOM elements in the mark's area (for a drawing, within 20px of it), best match first (`selector`, `tag`, `text`, `rect`), and `quote` is the page's exact words there. They include neighbors of what was meant, so pick using the capture. Use them to find the code: grep for the text, class names or test ids.
   - `box` is in page coordinates; `viewport` holds the window size and scroll position at the time. Raw stroke points are left out of the pull; `file` is the full mark if you need them.
   - `new: true` means added, edited or followed up since the last pull.
3. Make the change, or answer the question.
4. `annot resolve <id> "<one line: what you did or the answer>"`. The reply is added to the thread and shows under the mark. Resolve only marks you addressed; leave the rest open and say why in chat.

`annot pull --all` includes resolved marks. `annot --help` shows usage. If `annot resolve` is refused by a sandbox, ask the user to approve it; `~/.annotations` needs to be writable.
