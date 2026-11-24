// Toggles the overlay, relays its requests to the native host, takes the viewport capture on
// save, and keeps the toolbar badge at the page's open-mark count.
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

function setBadge(tabId, marks) {
  const open = marks.filter((m) => m.status === 'open').length;
  chrome.action.setBadgeText({ tabId, text: open ? String(open) : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#ff6a3d' });
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
  if (msg.op === 'list' && res.ok) setBadge(tab.id, res.marks);
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
  if (change.status !== 'complete' || !markable(tab.url)) return;
  try {
    knownHosts ??= new Set((await native({ op: 'hosts' })).hosts || []);
    if (!knownHosts.has(hostOf(tab.url))) return;
    const res = await native({ op: 'list', url: tab.url });
    if (res.ok) setBadge(tabId, res.marks);
  } catch {
    // native host not installed yet; the overlay reports it when opened
  }
});
