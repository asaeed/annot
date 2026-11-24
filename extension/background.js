// Toggles the overlay, relays its requests to the native host, takes the viewport capture on
// save, and keeps the toolbar icon showing annotate mode and the page's open-mark count.
const HOST = 'com.asaeed.annot';
let knownHosts = null; // hosts that have marks, so ordinary browsing doesn't spawn the native host
const pendingMarks = new Map();

const native = (msg) => chrome.runtime.sendNativeMessage(HOST, msg);

function inTabOrder(tabId, action) {
  const next = (pendingMarks.get(tabId) ?? Promise.resolve()).catch(() => {}).then(action);
  pendingMarks.set(tabId, next);
  return next.finally(() => {
    if (pendingMarks.get(tabId) === next) pendingMarks.delete(tabId);
  });
}

const clearDraft = (tabId) => native({ op: 'draft', tabId });

function hostOf(url) {
  const u = new URL(url);
  return u.protocol === 'file:' ? 'file' : u.host;
}

const markable = (url) => /^(https?|file):/.test(url || '');

// The toolbar icon: a gray nib in an outlined square, or a solid brand-color tile while annotate mode
// is on in that tab, with the page's open-mark count on its corner. The count is drawn into the icon
// because Chrome's own badge can't be made smaller. Chrome resets per-tab icons when the tab loads a
// new document (the overlay is gone) but not on pushState or #hash.
const BRAND = '#ff6a3d';
const INK = '#1d1d1f';
const bitmaps = {};
const openCount = (marks) => marks.filter((m) => m.status === 'open').length;

async function iconImages(on, open) {
  const images = {};
  for (const size of [16, 32]) {
    const file = `icons/${on ? 'on' : 'off'}-${size}.png`;
    bitmaps[file] ??= await createImageBitmap(await (await fetch(file)).blob());
    const g = new OffscreenCanvas(size, size).getContext('2d');
    g.drawImage(bitmaps[file], 0, 0);
    if (open) drawCount(g, size / 16, open > 99 ? '99+' : String(open), on);
    images[size] = g.getImageData(0, 0, size, size);
  }
  return images;
}

// A pill in the bottom-right corner with a 1px gap cut around it: brand-colored when off, ink when
// on (the icon is brand-colored then). Smaller than Chrome's badge, which can't be resized.
function drawCount(g, s, text, on) {
  g.font = `700 ${8 * s}px system-ui, sans-serif`;
  const h = 10 * s;
  const w = Math.max(h, g.measureText(text).width + 3 * s);
  const x = 16 * s - w;
  const y = 16 * s - h;
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.roundRect(x - s, y - s, w + 2 * s, h + 2 * s, h / 2 + s);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = on ? INK : BRAND;
  g.beginPath();
  g.roundRect(x, y, w, h, h / 2);
  g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x + w / 2, y + h / 2 + 0.5 * s);
}

async function paint(tabId, on, open) {
  chrome.action.setIcon({ tabId, imageData: await iconImages(on, open) }).catch(() => {});
}

// Whether annotate mode is on in a tab. The overlay knows; state kept here wouldn't survive the
// worker going idle.
async function overlayOn(tabId) {
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!window.__annot?.on?.() });
    return r.result;
  } catch {
    return false;
  }
}

const inject = (tabId) =>
  chrome.scripting.executeScript({ target: { tabId }, files: ['shapes.js', 'overlay.js'] }).catch(() => {});

// ⌥A or the toolbar icon.
async function toggle(tab) {
  if (!markable(tab.url)) return;
  if (await changedOnDisk()) {
    await chrome.storage.local.set({ toggleAfterReload: tab.id });
    return chrome.runtime.reload();
  }
  inject(tab.id);
}
chrome.action.onClicked.addListener(toggle);

// shortcut: dev-only self-reload, remove before wrapping up development. When manifest.json or
// background.js change on disk, ⌥A reloads the extension and then toggles, so edits apply without
// a click on chrome://extensions. overlay.js and shapes.js need no reload: each injection reads them fresh.
const OWN = ['manifest.json', 'background.js'];
const readOwn = async () => (await Promise.all(OWN.map((f) => fetch(f, { cache: 'no-store' }).then((r) => r.text())))).join('\0');
// storage.session outlives the worker going idle but is cleared by a reload, so it holds the files as loaded.
const loadedFiles = (async () => {
  const { loaded } = await chrome.storage.session.get('loaded');
  if (loaded) return loaded;
  const now = await readOwn();
  await chrome.storage.session.set({ loaded: now });
  return now;
})();
const changedOnDisk = async () => {
  try {
    return (await readOwn()) !== (await loadedFiles);
  } catch {
    return false;
  }
};
chrome.storage.local.get('toggleAfterReload').then(({ toggleAfterReload: tabId }) => {
  if (tabId == null) return;
  chrome.storage.local.remove('toggleAfterReload');
  inject(tabId);
});
// end shortcut

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tab = sender.tab;
  if (msg.op === 'mode') return void paint(tab.id, msg.on, msg.open);
  const response = msg.op === 'draft' || msg.op === 'save'
    ? inTabOrder(tab.id, () => relay(msg, tab))
    : relay(msg, tab);
  response.then(reply, (e) => reply({ ok: false, error: e.message }));
  return true;
});

async function relay(msg, tab) {
  if (msg.op === 'save' || (msg.op === 'draft' && msg.mark && msg.takeCapture)) {
    try {
      const [before] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
      if (before?.id === tab.id) {
        const png = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        const [after] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
        if (after?.id === tab.id) msg.capture = png.split(',')[1];
      }
    } catch {
      // Capture can be rate-limited; the target is still available.
    }
  }
  if (msg.op === 'draft') msg.tabId = tab.id;
  if (msg.op === 'save') {
    msg.tabId = tab.id;
    knownHosts?.add(hostOf(msg.mark.url));
  }
  const res = await native(msg);
  // The overlay only lists marks while annotate mode is on.
  if (msg.op === 'list' && res.ok) paint(tab.id, true, openCount(res.marks));
  return res;
}

chrome.tabs.onRemoved.addListener((tabId) => {
  inTabOrder(tabId, () => clearDraft(tabId)).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  native({ op: 'clear-drafts' }).catch(() => {});
});

chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status === 'loading') {
    inTabOrder(tabId, () => clearDraft(tabId)).catch(() => {});
    return;
  }
  if (change.status === 'complete') updateIcon(tabId, tab.url);
});

async function updateIcon(tabId, url) {
  if (!markable(url)) return;
  try {
    knownHosts ??= new Set((await native({ op: 'hosts' })).hosts || []);
    if (!knownHosts.has(hostOf(url))) return;
    const res = await native({ op: 'list', url });
    if (res.ok) paint(tabId, await overlayOn(tabId), openCount(res.marks));
  } catch {
    // native host not installed yet; the overlay reports it when opened
  }
}

// Coming back to a tab or to Chrome (say, from the terminal) picks up marks the agent resolved meanwhile.
async function iconActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) updateIcon(tab.id, tab.url);
}
chrome.tabs.onActivated.addListener(iconActiveTab);
chrome.windows.onFocusChanged.addListener((id) => id !== chrome.windows.WINDOW_ID_NONE && iconActiveTab());
