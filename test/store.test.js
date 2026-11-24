import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from '../lib/store.js';

const page = 'http://localhost:5173/projects/42?tab=experts';
const mark = (o = {}) => ({ url: page, title: 'P', kind: 'box', text: 'sortable?', box: { x: 1, y: 2, w: 30, h: 40 }, ...o });

beforeEach(() => {
  process.env.ANNOT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'annot-'));
});

test('save numbers marks per page and list filters by path', () => {
  store.save(mark());
  store.save(mark({ text: 'second' }));
  store.save(mark({ url: 'http://localhost:5173/other' }));
  const { round, marks } = store.list('http://localhost:5173/projects/42');
  assert.equal(round, 1);
  assert.deepEqual(marks.map((m) => [m.n, m.text, m.status]), [[1, 'sortable?', 'open'], [2, 'second', 'open']]);
});

test('capture is written next to the mark', () => {
  const m = store.save(mark(), Buffer.from('png').toString('base64'));
  assert.equal(fs.readFileSync(path.join(process.env.ANNOT_DIR, 'localhost:5173', m.capture), 'utf8'), 'png');
  assert.ok(path.isAbsolute(store.pull()[0].capture));
});

test('pull flags new marks, bumps the round once, and accepts scheme-less prefixes', () => {
  store.save(mark());
  const first = store.pull('localhost:5173/projects');
  assert.equal(first.length, 1);
  assert.equal(first[0].new, true);
  assert.equal(store.pull()[0].new, false);
  assert.equal(store.list(page).round, 2);
  assert.equal(store.save(mark()).round, 2);
  assert.deepEqual(store.pull('http://elsewhere'), []);
});

test('resolve adds the reply to the thread; a follow-up adds to it and reopens, keeping the original note', () => {
  const m = store.save(mark({ color: '#ff6a3d' }));
  assert.deepEqual(m.thread, []);
  store.resolve(m.id, 'made it sortable');
  assert.deepEqual(store.pull(), []);
  const [resolved] = store.pull(undefined, { all: true });
  assert.deepEqual(resolved.thread.map((t) => [t.from, t.text]), [['agent', 'made it sortable']]);
  const followed = store.save({ ...m, followUp: 'now sort descending' });
  assert.equal(followed.status, 'open');
  assert.equal(followed.text, 'sortable?');
  assert.equal(followed.color, '#ff6a3d');
  assert.deepEqual(followed.thread.map((t) => [t.from, t.text]), [['agent', 'made it sortable'], ['user', 'now sort descending']]);
});

test('marks saved with a single reply read back as a thread', () => {
  const m = store.save(mark());
  const file = path.join(process.env.ANNOT_DIR, 'localhost:5173', `${m.id}.json`);
  const { thread, ...old } = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...old, status: 'resolved', reply: 'done' }));
  assert.deepEqual(store.list(page).marks[0].thread.map((t) => [t.from, t.text]), [['agent', 'done']]);
  assert.ok(!('reply' in store.resolve(m.id, 'again')));
});

test('clear deletes every mark on one page and nothing else', () => {
  store.save(mark(), 'cG5n');
  store.save(mark({ url: `${page}#second` }));
  store.save(mark({ url: 'http://localhost:5173/other' }));
  assert.equal(store.clear(page), 2);
  assert.deepEqual(store.list(page).marks, []);
  assert.equal(store.list('http://localhost:5173/other').marks.length, 1);
  assert.deepEqual(fs.readdirSync(path.join(process.env.ANNOT_DIR, 'localhost:5173')).filter((f) => f.endsWith('.png')), []);
});

test('remove deletes the mark and trashes its capture; bad ids are rejected', () => {
  const m = store.save(mark(), 'cG5n');
  store.remove(page, m.id);
  assert.deepEqual(store.list(page).marks, []);
  assert.deepEqual(fs.readdirSync(path.join(process.env.ANNOT_DIR, 'localhost:5173')), ['.trash']);
  assert.throws(() => store.remove(page, '../../etc'), /bad mark id/);
  assert.throws(() => store.resolve('nope'), /no mark/);
});

test('pull leaves out raw strokes, points at the full file, and still works read-only', (t) => {
  const m = store.save(mark({ kind: 'stroke', strokes: [[[0, 0], [9, 9]]] }));
  const dir = path.join(process.env.ANNOT_DIR, 'localhost:5173');
  fs.chmodSync(dir, 0o555);
  t.after(() => fs.chmodSync(dir, 0o755));
  const [pulled] = store.pull();
  assert.equal(pulled.id, m.id);
  assert.ok(!('strokes' in pulled));
  assert.deepEqual(JSON.parse(fs.readFileSync(pulled.file, 'utf8')).strokes, [[[0, 0], [9, 9]]]);
  assert.equal(store.pull()[0].new, true, 'pull was not recorded');
});

test('undo puts marks back with their capture, and refuses once an agent has changed one', () => {
  const dir = path.join(process.env.ANNOT_DIR, 'localhost:5173');
  const png = (m) => fs.readFileSync(path.join(dir, m.capture), 'utf8');
  const a = store.save(mark(), Buffer.from('shot 1').toString('base64'));
  // Undo an edit: the old note and the old capture come back.
  const edited = store.save({ ...a, text: 'changed' }, Buffer.from('shot 2').toString('base64'));
  store.restore([{ url: page, id: a.id, before: a, after: edited.updated }]);
  assert.equal(store.list(page).marks[0].text, 'sortable?');
  assert.equal(png(store.list(page).marks[0]), 'shot 1');
  // Undo a Clear: every mark comes back, capture included.
  const b = store.save(mark({ text: 'second' }));
  const before = store.list(page).marks;
  store.clear(page);
  store.restore(before.map((m) => ({ url: page, id: m.id, before: m, after: null })));
  assert.deepEqual(store.list(page).marks.map((m) => [m.n, m.text]), [[1, 'sortable?'], [2, 'second']]);
  assert.equal(png(store.list(page).marks[0]), 'shot 1');
  // Undo a new mark the agent has since replied to: refused, reply kept.
  store.resolve(b.id, 'done');
  assert.throws(() => store.restore([{ url: page, id: b.id, before: null, after: b.updated }]), /changed it since/);
  assert.equal(store.list(page).marks[1].thread[0].text, 'done');
  // Undo a new mark: gone.
  const c = store.save(mark({ text: 'third' }));
  store.restore([{ url: page, id: c.id, before: null, after: c.updated }]);
  assert.equal(store.list(page).marks.length, 2);
  // Chrome starting empties the trash.
  store.clearDrafts();
  assert.ok(!fs.existsSync(path.join(dir, '.trash')));
});

test('file:// plans store under the file host', () => {
  store.save(mark({ url: 'file:///Users/me/plan.html' }));
  assert.equal(store.list('file:///Users/me/plan.html').marks.length, 1);
  assert.deepEqual(store.hosts(), ['file']);
});

test('native host round-trips one framed message', async () => {
  const bin = path.join(import.meta.dirname, '..', 'bin', 'annot.js');
  const child = spawn(process.execPath, [bin, 'chrome-extension://abc/'], { env: process.env });
  const body = Buffer.from(JSON.stringify({ op: 'save', mark: mark() }));
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length);
  child.stdin.write(Buffer.concat([head, body]));
  const out = await new Promise((resolve) => {
    const chunks = [];
    child.stdout.on('data', (c) => chunks.push(c));
    child.on('close', () => resolve(Buffer.concat(chunks)));
  });
  const res = JSON.parse(out.subarray(4, 4 + out.readUInt32LE(0)));
  assert.equal(res.ok, true);
  assert.equal(res.mark.n, 1);
});
