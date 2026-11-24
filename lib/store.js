// Mark store: one JSON file per mark under ~/.annotations/<host>/, its PNG capture alongside,
// and <host>/.state.json holding { lastPull } for that host. Captures of deleted or
// re-captured marks wait in <host>/.trash for undo until Chrome next starts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const root = () => process.env.ANNOT_DIR || path.join(os.homedir(), '.annotations');

export function hostOf(url) {
  const u = new URL(url);
  const host = u.protocol === 'file:' ? 'file' : u.host;
  if (!host || host.startsWith('.') || host.includes('/')) throw new Error(`unsupported url ${url}`);
  return host;
}

const dirOf = (host) => path.join(root(), host);
const stateFile = (host) => path.join(dirOf(host), '.state.json');
const stateOf = (host) => readJson(stateFile(host)) || { lastPull: null };

function checkId(id) {
  if (!/^[a-z0-9]+$/.test(id || '')) throw new Error(`bad mark id ${id}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Write to a temp file and rename, so a reader never sees half a mark.
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

// Marks saved before conversations had a single `reply`; read them as a one-message thread.
function readMark(file) {
  const m = readJson(file);
  if (m && !m.thread) {
    m.thread = m.reply ? [{ from: 'agent', text: m.reply, at: m.updated }] : [];
    delete m.reply;
  }
  return m;
}

function marksIn(host) {
  return filesIn(dirOf(host))
    .filter((n) => n.endsWith('.json') && !n.startsWith('.'))
    .map((n) => readMark(path.join(dirOf(host), n)))
    .filter(Boolean);
}

function filesIn(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

export function hosts() {
  try {
    return fs.readdirSync(root(), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name);
  } catch {
    return [];
  }
}

// Marks for one page. shortcut: pages are keyed by pathname, so hash-routed SPAs share marks
// across routes; key on the hash too if that gets confusing.
export function list(url) {
  const host = hostOf(url);
  const { pathname } = new URL(url);
  const marks = marksIn(host)
    .filter((m) => new URL(m.url).pathname === pathname)
    .sort((a, b) => a.n - b.n);
  return { marks };
}

const FIELDS = ['url', 'title', 'kind', 'shape', 'color', 'text', 'quote', 'tip', 'viewport', 'box', 'strokes', 'elements'];
const pick = (o) => Object.fromEntries(FIELDS.filter((k) => k in o).map((k) => [k, o[k]]));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const draftsDir = () => path.join(root(), '.drafts');

function draftFile(tabId, ext) {
  if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error('invalid draft tab');
  return path.join(draftsDir(), `${tabId}.${ext}`);
}

export function publishDraft(tabId, input, capture) {
  const file = draftFile(tabId, 'json');
  if (!input) {
    fs.rmSync(file, { force: true });
    fs.rmSync(draftFile(tabId, 'png'), { force: true });
    return;
  }
  hostOf(input.url);
  const prev = readJson(file);
  const captureFile = draftFile(tabId, 'png');
  if (capture) {
    fs.mkdirSync(draftsDir(), { recursive: true });
    const tmp = `${captureFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(capture, 'base64'));
    fs.renameSync(tmp, captureFile);
  }
  writeJson(file, {
    ...pick(input),
    status: 'draft',
    updated: new Date().toISOString(),
    capture: (capture || (prev?.url === input.url && prev.capture)) ? captureFile : null,
  });
}

// Run when Chrome starts: drafts, and the captures kept for undo, only matter within a browser session.
export function clearDrafts() {
  fs.rmSync(draftsDir(), { recursive: true, force: true });
  for (const host of hosts()) fs.rmSync(path.join(dirOf(host), '.trash'), { recursive: true, force: true });
}

// Creates a mark (no id) or updates one. `text` is the original note; `followUp` adds the user's
// next message to the mark's thread and reopens it, and so does editing a resolved mark's text.
// capture is a base64 PNG of the viewport.
export function save(input, capture, tabId) {
  const host = hostOf(input.url);
  const now = new Date().toISOString();
  let mark;
  if (input.id) {
    checkId(input.id);
    const prev = readMark(path.join(dirOf(host), `${input.id}.json`));
    if (!prev) throw new Error(`no mark ${input.id}`);
    mark = { ...prev, ...pick(input), updated: now };
    if (input.followUp) {
      mark.thread = [...prev.thread, { from: 'user', text: input.followUp, at: now }];
      mark.status = 'open';
    } else if (prev.status === 'resolved' && mark.text !== prev.text) {
      mark.status = 'open';
    }
  } else {
    const { marks } = list(input.url);
    const n = Math.max(0, ...marks.map((m) => m.n)) + 1;
    mark = { id: newId(), n, ...pick(input), status: 'open', thread: [], created: now, updated: now, capture: null };
  }
  if (!capture && tabId !== undefined) {
    const draft = readJson(draftFile(tabId, 'json'));
    const sameTarget = draft?.url === input.url && draft.kind === input.kind &&
      JSON.stringify(draft.box) === JSON.stringify(input.box) &&
      JSON.stringify(draft.strokes) === JSON.stringify(input.strokes) &&
      JSON.stringify(draft.viewport) === JSON.stringify(input.viewport);
    if (sameTarget && draft.capture && fs.existsSync(draft.capture)) {
      capture = fs.readFileSync(draft.capture).toString('base64');
    }
  }
  if (capture) {
    fs.mkdirSync(dirOf(host), { recursive: true });
    toTrash(dirOf(host), mark.id);
    fs.writeFileSync(path.join(dirOf(host), `${mark.id}.png`), Buffer.from(capture, 'base64'));
    mark.capture = `${mark.id}.png`;
  }
  writeJson(path.join(dirOf(host), `${mark.id}.json`), mark);
  return mark;
}

export function remove(url, id) {
  checkId(id);
  const dir = dirOf(hostOf(url));
  fs.rmSync(path.join(dir, `${id}.json`), { force: true });
  toTrash(dir, id);
}

// Moves a mark's capture (if any) to <host>/.trash, where undo can bring it back.
function toTrash(dir, id) {
  fs.mkdirSync(path.join(dir, '.trash'), { recursive: true });
  try {
    fs.renameSync(path.join(dir, `${id}.png`), path.join(dir, '.trash', `${id}.png`));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

// Undo: puts each changed mark back as it was (`before`; null removes it), but only if it's still
// as the change left it (`after`: its updated time, null if deleted), so a reply an agent added
// since is never lost. All or nothing.
export function restore(changes) {
  const files = changes.map(({ url, id, before }) => {
    checkId(id);
    if (before && (before.id !== id || hostOf(before.url) !== hostOf(url))) throw new Error('bad undo');
    return path.join(dirOf(hostOf(url)), `${id}.json`);
  });
  changes.forEach(({ after }, i) => {
    if ((readJson(files[i])?.updated ?? null) !== after) throw new Error('an agent changed it since');
  });
  changes.forEach(({ url, id, before }, i) => {
    if (!before) return remove(url, id);
    const dir = path.dirname(files[i]);
    try {
      fs.renameSync(path.join(dir, '.trash', `${id}.png`), path.join(dir, `${id}.png`));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    writeJson(files[i], { ...before, capture: fs.existsSync(path.join(dir, `${id}.png`)) ? `${id}.png` : null });
  });
}

// Deletes every mark on one page (same host and path, as in list).
export function clear(url) {
  const { marks } = list(url);
  for (const m of marks) remove(m.url, m.id);
  return marks.length;
}

// Resolves a mark, adding the reply (if any) to its thread.
export function resolve(id, reply) {
  checkId(id);
  for (const host of hosts()) {
    const file = path.join(dirOf(host), `${id}.json`);
    const mark = readMark(file);
    if (!mark) continue;
    const now = new Date().toISOString();
    if (reply) mark.thread.push({ from: 'agent', text: reply, at: now });
    Object.assign(mark, { status: 'resolved', updated: now });
    writeJson(file, mark);
    return mark;
  }
  throw new Error(`no mark ${id}`);
}

const bare = (u) => u.replace(/^[a-z]+:\/\//, '');

// Open marks (or all with { all: true }) whose URL starts with prefix, with or without the scheme.
// Marks added or edited since the host's last pull get new: true.
// Raw stroke points are left out (shape, elements and the capture say more); `file` has the full mark.
export function pull(prefix, { all = false } = {}) {
  const out = [];
  for (const host of hosts()) {
    const state = stateOf(host);
    const marks = marksIn(host).filter(
      (m) => (!prefix || bare(m.url).startsWith(bare(prefix))) && (all || m.status === 'open'),
    );
    let fresh = false;
    for (const { strokes, ...m } of marks) {
      const isNew = !state.lastPull || m.updated > state.lastPull;
      fresh ||= isNew;
      const dir = dirOf(host);
      out.push({ ...m, host, new: isNew, capture: m.capture && path.join(dir, m.capture), file: path.join(dir, `${m.id}.json`) });
    }
    try {
      if (fresh) writeJson(stateFile(host), { lastPull: new Date().toISOString() });
    } catch {
      // shortcut: in a read-only sandbox (e.g. Codex workspace-write) the pull isn't recorded, so marks
      // stay new; add ~/.annotations to the sandbox's writable roots to fix.
    }
  }
  for (const name of filesIn(draftsDir()).filter((name) => /^\d+\.json$/.test(name))) {
    const file = path.join(draftsDir(), name);
    const draft = readJson(file);
    if (!draft || (prefix && !bare(draft.url).startsWith(bare(prefix)))) continue;
    const { strokes, ...mark } = draft;
    out.push({ ...mark, host: hostOf(mark.url), file });
  }
  return out.sort((a, b) => a.host.localeCompare(b.host) || a.url.localeCompare(b.url) ||
    (a.n ?? Number.MAX_SAFE_INTEGER) - (b.n ?? Number.MAX_SAFE_INTEGER));
}
