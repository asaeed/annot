// End to end: load the unpacked extension in Playwright's Chromium, wired to a native host that
// writes to a temp store, then draw a box and a stroke on a local page and check the files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const repo = path.join(import.meta.dirname, '..');
const ext = path.join(repo, 'extension');

const PAGE = `<!doctype html><title>Plan</title>
<body style="margin:0;font:16px sans-serif">
  <h1 id="title" style="margin:40px">Expert search plan</h1>
  <table class="experts" style="margin:40px"><tr><th>Name</th><th>Last call</th></tr></table>
  <input type="password" value="hunter2" style="margin:40px">
  <p style="position:absolute;top:320px;left:40px;margin:0">Rank by <span id="u">recency of last call</span> then status</p>
  <div style="position:absolute;top:400px;left:0;right:0;height:60px;background:#eee"><button id="unlock" style="position:absolute;right:60px;top:15px">Unlock</button></div>
</body>`;

test('box, circle, arrow and underline each save the right target and a capture', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'annot-smoke-'));
  const store = path.join(tmp, 'store');
  const profile = path.join(tmp, 'profile');

  // Chromium also looks for native hosts in <user-data-dir>/NativeMessagingHosts.
  const wrapper = path.join(tmp, 'annot-host');
  fs.writeFileSync(wrapper, `#!/bin/sh\nANNOT_DIR="${store}" exec "${process.execPath}" "${repo}/bin/annot.js" "$@"\n`, { mode: 0o755 });
  const id = extensionId();
  fs.mkdirSync(path.join(profile, 'NativeMessagingHosts'), { recursive: true });
  fs.writeFileSync(
    path.join(profile, 'NativeMessagingHosts', 'com.asaeed.annot.json'),
    JSON.stringify({ name: 'com.asaeed.annot', description: 'annot test', path: wrapper, type: 'stdio', allowed_origins: [`chrome-extension://${id}/`] }),
  );

  const server = http.createServer((_, res) => res.end(PAGE)).listen(0);
  const url = `http://localhost:${server.address().port}/plan`;
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    viewport: { width: 1000, height: 700 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  t.after(async () => {
    await context.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const page = await context.newPage();
  await page.goto(url);
  const sw = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  assert.equal(new URL(sw.url()).host, id, 'manifest key gives the stable extension id');
  // Same as pressing ⌥A: inject the overlay into the active tab.
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['shapes.js', 'overlay.js'] });
  });

  const marks = () =>
    fs.existsSync(path.join(store, `localhost:${server.address().port}`))
      ? fs.readdirSync(path.join(store, `localhost:${server.address().port}`)).filter((f) => /^[a-z0-9]+\.json$/.test(f))
      : [];
  const waitFor = async (n) => {
    for (let i = 0; i < 50 && marks().length < n; i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(marks().length, n);
  };
  const pulledDraft = () => JSON.parse(execFileSync(process.execPath, [path.join(repo, 'bin/annot.js'), 'pull', url], {
    env: { ...process.env, ANNOT_DIR: store },
  })).find((mark) => mark.status === 'draft');
  const waitForDraft = async (present) => {
    for (let i = 0; i < 50; i++) {
      const draft = pulledDraft();
      if (Boolean(draft) === present) return draft;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail(present ? 'draft did not appear' : 'draft was not cleared');
  };

  // Box around the heading, then type and press Enter.
  const h1 = await page.locator('#title').boundingBox();
  await page.mouse.move(h1.x - 5, h1.y - 5);
  await page.mouse.down();
  await page.mouse.move(h1.x + 200, h1.y + h1.height + 5, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.type('make this bold');
  await page.keyboard.press('Enter');
  await waitFor(1);

  // Shift-drag a circle-ish stroke over the table and the password field.
  await page.keyboard.down('Shift');
  await page.mouse.move(30, 100);
  await page.mouse.down();
  for (const [x, y] of [[300, 100], [300, 260], [30, 260], [30, 110]]) await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.keyboard.type('wrong columns');
  await page.keyboard.press('Enter');
  await waitFor(2);

  // Three-stroke arrow below and left of Unlock, pointing at it: shaft, then two short head strokes.
  const btn = await page.locator('#unlock').boundingBox();
  const tip = [btn.x + btn.width / 2 - 10, btn.y + btn.height + 25];
  await page.keyboard.down('Shift');
  for (const [from, to] of [[[tip[0] - 140, tip[1] + 165], tip], [tip, [tip[0] - 22, tip[1] + 5]], [tip, [tip[0] + 3, tip[1] + 22]]]) {
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 8 });
    await page.mouse.up();
  }
  await page.keyboard.up('Shift');
  await page.keyboard.type('what does this do?');
  await page.keyboard.press('Enter');
  await waitFor(3);

  // Underline under a phrase in a sentence and save without a note.
  const u = await page.locator('#u').boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.move(u.x + 2, u.y + u.height + 3);
  await page.mouse.down();
  await page.mouse.move(u.x + u.width - 2, u.y + u.height + 4, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const draft = await waitForDraft(true);
  assert.equal(draft.shape, 'underline');
  assert.equal(draft.text, '');
  assert.match(draft.quote, /recency of last/);
  assert.ok(fs.statSync(draft.capture).size > 1000);
  assert.equal(marks().length, 3, 'draft stays out of saved marks');
  await page.keyboard.press('Enter');
  await waitFor(4);
  await waitForDraft(false);

  // Save a box around the button without a note.
  // Let Chromium's screenshot quota recover from the draft and final saves.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await page.mouse.move(btn.x - 5, btn.y - 5);
  await page.mouse.down();
  await page.mouse.move(btn.x + btn.width + 5, btn.y + btn.height + 5, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('Enter');
  await waitFor(5);

  const dir = path.join(store, `localhost:${server.address().port}`);
  const saved = marks().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).sort((a, b) => a.n - b.n);
  const [box, stroke, arrow, underline, blankBox] = saved;

  assert.equal(box.kind, 'box');
  assert.equal(box.shape, 'box');
  assert.equal(box.text, 'make this bold');
  assert.equal(box.url, url);
  assert.equal(box.elements[0].selector, '#title');
  assert.equal(box.elements[0].text, 'Expert search plan');
  assert.deepEqual(Object.keys(box.viewport), ['w', 'h', 'dpr', 'scrollX', 'scrollY']);
  assert.ok(fs.statSync(path.join(dir, box.capture)).size > 1000, 'viewport capture saved');

  assert.equal(stroke.kind, 'stroke');
  assert.equal(stroke.shape, 'circle');
  assert.equal(stroke.n, 2);
  assert.equal(stroke.text, 'wrong columns');
  assert.ok(stroke.strokes[0].length > 5);
  assert.ok(stroke.elements.some((e) => e.text === 'Last call'));
  assert.ok(!JSON.stringify(stroke).includes('hunter2'), 'typed field values never saved');

  assert.equal(arrow.shape, 'arrow');
  assert.deepEqual([arrow.elements[0].tag, arrow.elements[0].text], ['button', 'Unlock']);
  assert.ok(Math.hypot(arrow.tip.x - tip[0], arrow.tip.y - tip[1]) < 4);

  assert.equal(underline.shape, 'underline');
  assert.equal(underline.text, '');
  assert.match(underline.quote, /recency of last/);
  assert.ok(fs.statSync(path.join(dir, underline.capture)).size > 1000);

  assert.equal(blankBox.shape, 'box');
  assert.equal(blankBox.text, '');
  assert.equal(blankBox.elements[0].text, 'Unlock');
  assert.ok(fs.statSync(path.join(dir, blankBox.capture)).size > 1000);

  await page.mouse.move(400, 100);
  await page.mouse.down();
  await page.mouse.move(550, 160, { steps: 5 });
  await page.mouse.up();
  await waitForDraft(true);
  await page.keyboard.press('Escape');
  await waitForDraft(false);
  assert.equal(marks().length, 5, 'cancelling a draft does not save a mark');
});

function extensionId() {
  const { key } = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}
