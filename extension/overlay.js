// annot overlay. Injected by ⌥A or the toolbar icon; injecting it again toggles annotate mode.
// Everything lives in a closed shadow root so the page's CSS and the overlay don't mix.
(() => {
  if (window.__annot?.alive()) return window.__annot.toggle();

  const SVG = 'http://www.w3.org/2000/svg';
  const DEFAULT_COLOR = '#ff6a3d';
  const PALETTE = ['#ff6a3d', '#ff3d77', '#7b61ff', '#00a6fb', '#06d6a0', '#2b2d42'];
  const STYLE = `
    :host { all: initial; }
    [hidden] { display: none !important; }
    .layer { position: absolute; left: 0; top: 0; }
    svg { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; }
    path { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
    .box { position: absolute; box-sizing: border-box; border: 2px solid; border-radius: 10px; }
    .box.draft { border-style: dashed; }
    .num { position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; box-shadow: 0 0 0 2px #fff;
      font: 800 9.5px/16px system-ui, sans-serif; text-align: center; }
    .box.resolved, .num.resolved, path.resolved { opacity: .45; }
    .num.flash { animation: flash 1.2s ease-in-out; }
    /* Grows from its normal size, holds, then settles back. */
    @keyframes flash { 30%, 50% { transform: scale(1.8); box-shadow: 0 0 0 2px #fff, 0 0 0 6px rgba(0,0,0,.15); } }
    @media (prefers-reduced-motion: reduce) { .num.flash { animation: none; outline: 2px solid; outline-offset: 2px; } }
    /* The thread, as a frosted capsule: your note, the reply count and a check once resolved. Unfolded, the
       replies sit on a rail below the note. Dark glass on dark pages. */
    .layer { --glass: rgba(255,255,255,.76); --ring: rgba(0,0,0,.08); --shadow: 0 10px 28px -12px rgba(0,0,0,.35); --card: rgba(255,255,255,.92);
      --card-ring: rgba(0,0,0,.07); --fg: #27272a; --fg-strong: #18181b; --muted: #8a8a93; --ok: #15803d; --ok-bg: #dcf5e5; --rail-done: #d4d4d8; }
    .layer.dark { --glass: rgba(33,37,44,.74); --ring: rgba(255,255,255,.1); --shadow: 0 12px 30px -12px rgba(0,0,0,.75); --card: rgba(255,255,255,.07);
      --card-ring: rgba(255,255,255,.08); --fg: #d8dbe0; --fg-strong: #f4f5f7; --muted: #9198a1; --ok: #57d98b; --ok-bg: rgba(87,217,139,.15); --rail-done: #545d68; }
    .thread { position: absolute; width: max-content; max-width: 270px; padding: 2px; border-radius: 13px; color: var(--fg); font: 500 12.5px/1.4 system-ui, sans-serif;
      background: var(--glass); -webkit-backdrop-filter: blur(14px) saturate(1.6); backdrop-filter: blur(14px) saturate(1.6); box-shadow: 0 0 0 1px var(--ring), var(--shadow); }
    .row { display: flex; align-items: center; gap: 5px; }
    .note { max-width: 236px; padding: 3px 9px 4px; border-radius: 11px; background: var(--c); color: var(--on); white-space: pre-wrap; overflow-wrap: anywhere;
      box-shadow: 0 1px 1px rgba(0,0,0,.06), 0 3px 10px -4px rgba(0,0,0,.3); }
    .folded .note { max-width: 190px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { display: flex; align-items: center; gap: 3px; padding-right: 2px; color: var(--muted); font: 700 10.5px/1 system-ui, sans-serif; }
    .ok { display: grid; place-items: center; width: 17px; height: 17px; margin-right: 1px; border-radius: 50%; background: var(--ok-bg); color: var(--ok); }
    svg.ico { position: static; display: block; width: 11px; height: 11px; }
    .ico path { stroke: currentColor; stroke-width: 1.9; }
    .ico.chat path { fill: currentColor; stroke: none; }
    .replies { display: flow-root; padding: 0 1px; }
    .replies > :first-child { margin-top: 5px; }
    .replies > :last-child { margin-bottom: 1px; }
    .who { font: 700 10px/1.3 system-ui, sans-serif; color: var(--fg-strong); }
    .you .who { color: color-mix(in srgb, var(--c) 82%, var(--fg-strong)); }
    .who time { margin-left: 5px; color: var(--muted); font-weight: 500; }
    .b { white-space: pre-wrap; overflow-wrap: anywhere; }
    .rail { margin-left: 9px; padding: 3px 0 4px 10px; border-left: 2px solid color-mix(in srgb, var(--c) 55%, transparent); }
    .resolved .rail { border-left-color: var(--rail-done); }
    .msg { width: max-content; max-width: 214px; padding: 4px 10px 5px; border-radius: 10px; background: var(--card); box-shadow: 0 0 0 1px var(--card-ring); }
    .reply { margin-top: 6px; padding: 5px 10px; border-radius: 10px; background: var(--card); box-shadow: 0 0 0 1px var(--card-ring); color: var(--muted); font-size: 12px; cursor: text; }
    .catch { position: fixed; inset: 0; cursor: crosshair; }
    .editor { position: absolute; box-sizing: border-box; padding: 4px 9px; border: 2px solid; border-radius: 12px; background: #fff; color: #18181b;
      font: 600 12px/1.35 system-ui, sans-serif; resize: none; outline: none; overflow: hidden; box-shadow: 0 6px 18px -8px rgba(0,0,0,.3); }
    .tools { position: absolute; display: flex; gap: 8px; width: max-content; color: #a1a1aa; font: 700 10px/1.6 system-ui, sans-serif; }
    .tools button { all: unset; cursor: pointer; color: #e5484d; }
    .bar { position: fixed; right: 12px; bottom: 12px; display: flex; align-items: center; gap: 1px; padding: 3px; border-radius: 999px;
      background: #fff; color: #3f3f46; font: 700 11px system-ui, sans-serif; box-shadow: 0 4px 14px -6px rgba(0,0,0,.3), 0 0 0 1px #eee; }
    .bar button { all: unset; padding: 2px 8px; border-radius: 999px; cursor: pointer; }
    .bar button.on { background: var(--cur); color: var(--cur-on); }
    .bar button.danger { background: #e5484d; color: #fff; }
    .bar button:disabled { opacity: .4; cursor: default; }
    .bar b { margin-left: 3px; font-weight: 800; }
    .bar .logo { position: static; display: block; width: 18px; height: 18px; margin: 0 4px 0 1px; }
    .sep { width: 1px; height: 12px; margin: 0 3px; background: #eee; }
    .dot { display: block; width: 11px; height: 11px; border-radius: 50%; background: var(--cur); box-shadow: 0 0 0 1.5px #fff, 0 0 0 2.5px #ddd; }
    .bar button:focus-visible, .tools button:focus-visible, .sw:focus-visible { outline: 2px solid var(--cur); outline-offset: 1px; }
    .kbd { padding: 0 6px; color: #a1a1aa; font-size: 10px; }
    .ask { padding: 0 6px; }
    .err { padding: 0 6px; color: #e5484d; }
    .picker { position: fixed; right: 12px; box-sizing: border-box; width: 168px; padding: 7px; border-radius: 14px; background: #fff; color: #3f3f46;
      box-shadow: 0 8px 24px -10px rgba(0,0,0,.3), 0 0 0 1px #eee; }
    .field { position: relative; height: 76px; border-radius: 9px; cursor: crosshair; touch-action: none;
      background: linear-gradient(to bottom, #fff, rgba(255,255,255,0) 50%, rgba(0,0,0,0) 50%, #000),
        linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }
    .knob { position: absolute; box-sizing: border-box; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; border: 1.5px solid #fff; border-radius: 50%;
      background: var(--cur); box-shadow: 0 0 0 1px rgba(0,0,0,.35); pointer-events: none; }
    .sws { display: flex; align-items: center; gap: 5px; margin-top: 6px; }
    .sw { all: unset; width: 14px; height: 14px; border-radius: 50%; cursor: pointer; }
    .sw.sel { box-shadow: 0 0 0 1.5px #fff, 0 0 0 3px var(--cur); }
    .hex { margin-left: auto; color: #71717a; font: 9.5px ui-monospace, monospace; }
  `;

  let on = false;
  let marks = [];
  let filter = 'open';
  // The mark being drawn, edited or replied to: { kind, box, strokes, color, id?, orig?, reply? }.
  let draft = null;
  let drag = null;
  let pathname = location.pathname;
  let error = '';
  let hits = []; // clickable areas (boxes, threads and their fold buttons) from the last render
  const folded = new Set(); // marks whose thread is folded down to the note, for as long as the page is open
  let folding = null; // the mark whose thread was just folded or unfolded; the next render animates it
  let draftThread = null; // the thread element of the mark being replied to
  let shifts = new Map(); // mark id -> { dx, dy }: how far its element has moved since it was drawn
  let color = DEFAULT_COLOR; // for new marks
  let recent = []; // colors of saved marks, most recent first
  let pickerOpen = false;
  let confirming = false;
  let lastJump = null; // id of the mark ‹ › last scrolled to
  let flashId = null;

  const el = (tag, cls, parent) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    parent?.append(e);
    return e;
  };
  const place = (e, x, y, w, h) => {
    e.style.left = `${x}px`;
    e.style.top = `${y}px`;
    if (w != null) e.style.width = `${w}px`;
    if (h != null) e.style.height = `${h}px`;
  };
  const send = (msg) => chrome.runtime.sendMessage(msg).catch((e) => ({ ok: false, error: e.message }));
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const pt = (e) => ({ x: Math.round(e.clientX + scrollX), y: Math.round(e.clientY + scrollY) });
  const rectOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  const bounds = (pts) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return rectOf({ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) });
  };
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  // Dark text on light colors, white on the rest.
  // A 12×12 line icon for the thread capsule. Paint comes from the sheet (.ico rules).
  const icon = (parent, cls, d) => {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 12 12');
    s.setAttribute('class', `ico ${cls}`);
    s.setAttribute('aria-hidden', 'true');
    s.append(document.createElementNS(SVG, 'path'));
    s.firstChild.setAttribute('d', d);
    parent.append(s);
  };
  // Threads get dark glass on dark pages, judged by the page's own background (body's, else html's).
  const darkPage = () => {
    for (const e of [document.body, document.documentElement]) {
      const rgba = getComputedStyle(e).backgroundColor.match(/^rgba?\(([^)]+)\)/)?.[1].split(',').map(Number);
      if (rgba && (rgba[3] ?? 1) > 0.5) return 0.299 * rgba[0] + 0.587 * rgba[1] + 0.114 * rgba[2] < 128;
    }
    return false;
  };
  // How long ago an ISO time was, short: now, 5m, 2h, 3d, then the date.
  const ago = (iso) => {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (!(s >= 0)) return '';
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const onColor = (hex) => {
    const [r, g, b] = rgb(hex);
    return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? '#1a1a1a' : '#fff';
  };
  const hslHex = (h, l) => {
    const a = Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  // Where a color sits on the picker field: x = hue, y = lightness (white at the top, black at the bottom).
  const fieldPos = (hex) => {
    const [r, g, b] = rgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { x: ((h * 60 + 360) % 360) / 360, y: 1 - (max + min) / 2 };
  };

  // Styles go in via CSSOM (style.cssText, adoptedStyleSheets), which page CSP doesn't block.
  const host = document.createElement('annot-root');
  host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;display:none';
  const shadow = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(STYLE);
  shadow.adoptedStyleSheets = [sheet];
  const layer = el('div', 'layer', shadow);
  const catcher = el('div', 'catch', shadow);
  const editor = el('textarea', 'editor', shadow);
  const tools = el('div', 'tools', shadow);
  const bar = el('div', 'bar', shadow);
  const picker = el('div', 'picker', shadow);
  const field = el('div', 'field', picker);
  const knob = el('i', 'knob', field);
  const sws = el('div', 'sws', picker);
  document.documentElement.append(host);

  editor.rows = 1;
  editor.setAttribute('aria-label', 'annot note');
  editor.hidden = tools.hidden = picker.hidden = true;
  editor.addEventListener('input', () => {
    autosize();
    scheduleDraft();
  });
  el('span', '', tools).textContent = '↵ save · ⇧↵ new line · esc cancel';
  const delBtn = el('button', '', tools);
  delBtn.textContent = 'delete';
  delBtn.onclick = () => {
    const d = draft;
    draft = null;
    discardPublishedDraft();
    closeEditor();
    del(d.orig);
  };
  // Keep typing in the editor away from the page's own keyboard shortcuts.
  for (const type of ['keydown', 'keyup', 'keypress']) shadow.addEventListener(type, (e) => e.stopPropagation());

  // chrome.storage is missing until Chrome reloads the extension with the new manifest; colors just aren't remembered then.
  chrome.storage?.local
    .get(['color', 'recent'])
    .then((s) => {
      color = s.color || color;
      recent = s.recent || [];
      render();
    })
    .catch(() => {});
  const remember = () => chrome.storage?.local.set({ color, recent }).catch(() => {});

  const openNow = () => marks.filter((m) => m.status === 'open').length;
  const visible = () =>
    marks.filter(
      (m) => m.id !== draft?.id && (filter === 'all' || m.status === 'open'),
    );

  function render() {
    shifts = new Map(marks.map((m) => [m.id, shiftOf(m)])); // before the DOM changes, to avoid a layout per mark
    layer.replaceChildren();
    layer.classList.toggle('dark', darkPage());
    hits = [];
    draftThread = null;
    host.style.setProperty('--cur', color);
    host.style.setProperty('--cur-on', onColor(color));
    const svg = document.createElementNS(SVG, 'svg');
    layer.append(svg);
    for (const m of visible()) drawMark(svg, m, m.status === 'resolved' ? 'resolved' : '');
    if (draft?.reply) draftThread = drawMark(svg, { ...draft.orig, color: draft.color }, draft.orig.status === 'resolved' ? 'resolved' : '');
    else if (draft) drawMark(svg, { ...draft, n: draft.orig?.n }, 'draft');
    if (draft) editor.style.borderColor = draft.color;
    renderBar();
    renderPicker();
  }

  // A stroke as a smooth curve: points closer than 4px are skipped, then a curve runs through the midpoints,
  // so mouse jitter and whole-pixel points don't show as a shaky line. The saved points are unchanged.
  function curve(points, dx, dy) {
    const pts = [points[0]];
    for (const p of points.slice(1)) if (Math.hypot(p[0] - pts.at(-1)[0], p[1] - pts.at(-1)[1]) >= 4) pts.push(p);
    if (points.length > 1) pts[pts.length > 1 ? pts.length - 1 : 1] = points.at(-1); // always end where the pen lifted
    const at = ([x, y]) => `${x + dx} ${y + dy}`;
    let d = `M${at(pts[0])}`;
    for (let i = 1; i < pts.length - 1; i++) d += ` Q${at(pts[i])} ${at([(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2])}`;
    return pts.length > 1 ? `${d} L${at(pts.at(-1))}` : d;
  }

  // Draws one mark and its conversation, moved along with its element; returns the conversation element, if any.
  function drawMark(svg, m, cls) {
    const c = m.color || DEFAULT_COLOR;
    const { dx, dy } = shifts.get(m.id) || NO_SHIFT;
    if (m.kind === 'stroke') {
      for (const s of m.strokes) {
        const p = document.createElementNS(SVG, 'path');
        p.setAttribute('d', curve(s, dx, dy));
        p.style.stroke = c;
        if (cls) p.classList.add(cls);
        svg.append(p);
      }
    } else if (m.box) {
      const b = el('div', `box ${cls}`, layer);
      b.style.borderColor = c;
      place(b, m.box.x + dx, m.box.y + dy, m.box.w, m.box.h);
    }
    if (!m.box) return null;
    const box = boxNow(m);
    if (cls !== 'draft') hits.push({ m, ...box });
    if (m.n) {
      const num = el('div', `num ${cls}${m.id === flashId ? ' flash' : ''}`, layer);
      num.textContent = m.n;
      num.style.background = c;
      num.style.color = onColor(c);
      place(num, box.x, box.y);
    }
    const thread = m.thread || [];
    if (cls === 'draft' || !(m.text || thread.length)) return null;
    // A thread with replies folds down to one line, except while you're replying to it.
    const fold = thread.length > 0 && m.id !== draft?.id;
    const shut = fold && folded.has(m.id);
    const animating = fold && folding === m.id && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (folding === m.id) folding = null;
    const t = el('div', `thread ${cls}${shut && !animating ? ' folded' : ''}`, layer);
    t.style.setProperty('--c', c);
    t.style.setProperty('--on', onColor(c));
    const row = el('div', 'row', t);
    if (m.text) el('div', 'note', row).textContent = m.text;
    if (thread.length) {
      const meta = el('span', 'meta', row);
      icon(meta, 'chat', 'M1.8 3.2c0-.8.6-1.4 1.4-1.4h5.6c.8 0 1.4.6 1.4 1.4v3.6c0 .8-.6 1.4-1.4 1.4H5.2L3 10.1V8.2C2.3 8.2 1.8 7.6 1.8 6.8z');
      meta.append(thread.length);
    }
    if (m.status === 'resolved') {
      const ok = el('span', 'ok', row);
      ok.title = 'Resolved';
      icon(ok, 'check', 'M2.6 6.3 5 8.6l4.4-5');
    }
    const replies = el('div', 'replies', t);
    for (const msg of thread) {
      const card = el('div', 'msg', el('div', `rail ${msg.from === 'agent' ? 'agent' : 'you'}`, replies));
      const who = el('div', 'who', card);
      who.textContent = msg.from === 'agent' ? 'Agent' : 'You';
      if (msg.at) el('time', '', who).textContent = ago(msg.at);
      el('div', 'b', card).textContent = msg.text;
    }
    if (fold) el('div', 'reply', replies).textContent = 'Reply…';
    if (!thread.length || (shut && !animating)) replies.remove();
    place(t, box.x, box.y + box.h + 6);
    hits.push({ m, x: t.offsetLeft, y: t.offsetTop, w: t.offsetWidth, h: t.offsetHeight - (shut && animating ? replies.offsetHeight : 0) });
    // Clicking the note's line folds or unfolds; clicking a reply or Reply… replies.
    if (fold) hits.push({ m, fold: true, x: t.offsetLeft + row.offsetLeft, y: t.offsetTop + row.offsetTop, w: row.offsetWidth, h: row.offsetHeight });
    if (animating) {
      // The capsule grows to show the replies, or shrinks back to one line.
      const frames = [{ height: '0px', opacity: 0 }, { height: `${replies.offsetHeight}px`, opacity: 1 }];
      replies.style.overflow = 'hidden';
      const a = replies.animate(shut ? frames.reverse() : frames, { duration: shut ? 180 : 240, easing: shut ? 'ease-in' : 'cubic-bezier(.2,.8,.2,1)', fill: shut ? 'forwards' : 'none' });
      a.finished.then(() => {
        if (!shut) return (replies.style.overflow = '');
        replies.remove();
        t.classList.add('folded');
      }, () => {});
    }
    return t;
  }

  // The annot logo on a round tile to match the pill-shaped bar: a white nib with a fine slit. Paint goes in
  // style because the sheet's path rule would override attributes.
  const LOGO = (() => {
    const add = (parent, tag, attrs, style = '') => {
      const e = document.createElementNS(SVG, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      e.style.cssText = style;
      parent.append(e);
      return e;
    };
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 16 16');
    s.setAttribute('class', 'logo');
    s.setAttribute('aria-hidden', 'true');
    add(s, 'circle', { cx: 8, cy: 8, r: 8 }, `fill:${DEFAULT_COLOR}`);
    const g = add(s, 'g', { transform: 'translate(8 8) scale(.8) translate(-8 -7.6)' });
    add(g, 'path', { d: 'M8 1.6l4.8 5-2.7 7H5.9l-2.7-7z' }, 'fill:#fff;stroke:#fff;stroke-width:1;stroke-linejoin:round');
    add(g, 'path', { d: 'M8 2.4v6.2' }, `stroke:${DEFAULT_COLOR};stroke-width:1;stroke-linecap:round`);
    add(g, 'circle', { cx: 8, cy: 8.6, r: 1.6 }, `fill:${DEFAULT_COLOR}`);
    return s;
  })();

  function renderBar() {
    bar.replaceChildren(LOGO);
    const button = (label, onclick, cls = '') => {
      const b = el('button', cls, bar);
      b.textContent = label;
      b.onclick = onclick;
      return b;
    };
    if (confirming) {
      el('span', 'ask', bar).textContent = `Delete all ${marks.length} here?`;
      button('Delete', clearPage, 'danger');
      button('Cancel', () => {
        confirming = false;
        render();
      });
      return;
    }
    const count = {
      open: marks.filter((m) => m.status === 'open').length,
      all: marks.length,
    };
    for (const [key, name] of [['open', 'Open'], ['all', 'All']]) {
      const b = button(name, () => {
        filter = key;
        render();
      }, filter === key ? 'on' : '');
      el('b', '', b).textContent = count[key];
      b.setAttribute('aria-pressed', String(filter === key));
    }
    el('span', 'sep', bar);
    for (const [label, step, name] of [['‹', -1, 'Previous mark'], ['›', 1, 'Next mark']]) {
      const b = button(label, () => jump(step));
      b.title = name;
      b.setAttribute('aria-label', name);
      b.disabled = !visible().length;
    }
    el('span', 'sep', bar);
    const dot = button('', () => {
      pickerOpen = !pickerOpen;
      render();
    });
    dot.title = 'Color';
    dot.setAttribute('aria-label', 'Color');
    dot.setAttribute('aria-expanded', String(pickerOpen));
    el('i', 'dot', dot);
    const clear = button('Clear', () => {
      confirming = true;
      pickerOpen = false;
      render();
    });
    clear.disabled = !marks.length;
    const kbd = el('span', error ? 'err' : 'kbd', bar);
    kbd.textContent = error || '⌥A';
    if (!error) kbd.title = 'drag: box · ⇧ drag: draw · click a mark: edit or reply · ⌘z: undo · esc: exit';
  }

  function renderPicker() {
    picker.hidden = !pickerOpen || bar.hidden;
    if (picker.hidden) return;
    picker.style.bottom = `${12 + bar.offsetHeight + 6}px`;
    const current = draft ? draft.color : color;
    const pos = fieldPos(current);
    knob.style.left = `${pos.x * 100}%`;
    knob.style.top = `${pos.y * 100}%`;
    sws.replaceChildren();
    const shown = [...recent, ...PALETTE.filter((c) => !recent.includes(c))].slice(0, 6);
    for (const c of shown) {
      const s = el('button', c === current ? 'sw sel' : 'sw', sws);
      s.style.background = c;
      s.title = c;
      s.setAttribute('aria-label', `Use ${c}`);
      s.onclick = () => pick(c, true);
    }
    el('span', 'hex', sws).textContent = current.toUpperCase();
  }

  // Sets the color for new marks, and for the mark being drawn or edited.
  function pick(c, done) {
    color = c;
    if (draft) draft.color = c;
    render();
    if (done) {
      remember();
      if (draft) editor.focus({ preventScroll: true });
    }
  }

  const fromField = (e) => {
    const r = field.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return hslHex(x * 360, Math.min(0.95, Math.max(0.05, 1 - y)));
  };
  field.addEventListener('pointerdown', (e) => {
    field.setPointerCapture(e.pointerId);
    pick(fromField(e));
  });
  field.addEventListener('pointermove', (e) => {
    if (field.hasPointerCapture(e.pointerId)) pick(fromField(e));
  });
  field.addEventListener('pointerup', (e) => pick(fromField(e), true));

  // Scrolls to the next or previous mark the filter shows, in page order (top to bottom), then pulses its
  // number once the scroll has stopped, so the pulse is seen.
  function jump(step) {
    const list = visible().filter((m) => m.box).map((m) => ({ m, b: boxNow(m) })).sort((a, z) => a.b.y - z.b.y || a.b.x - z.b.x);
    if (!list.length) return;
    const at = list.findIndex(({ m }) => m.id === lastJump);
    const { m, b } = list[at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length];
    lastJump = m.id;
    const pulse = () => {
      if (lastJump !== m.id) return; // another jump since
      flashId = m.id;
      render();
      setTimeout(() => {
        if (flashId === m.id) flashId = null;
      }, 1300);
    };
    // Where the page can actually scroll to; if it's already there, no scroll (and no scrollend) happens.
    const s = document.scrollingElement || document.documentElement;
    const offscreenX = b.x < scrollX || b.x + b.w > scrollX + innerWidth;
    const top = Math.min(Math.max(0, b.y - innerHeight / 3), s.scrollHeight - s.clientHeight);
    const left = offscreenX ? Math.min(Math.max(0, b.x - 40), s.scrollWidth - s.clientWidth) : scrollX;
    if (Math.abs(top - scrollY) < 1 && Math.abs(left - scrollX) < 1) return pulse();
    addEventListener('scrollend', pulse, { once: true });
    scrollTo({ top, left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  async function clearPage() {
    confirming = false;
    const gone = marks;
    const res = await change({ op: 'clear', url: location.href }, () => gone.map((m) => ({ url: m.url, id: m.id, before: m, after: null })));
    if (!res?.ok) error = `not cleared: ${res?.error || 'no response'}`;
    await load();
  }

  function autosize() {
    editor.style.height = 'auto';
    // scrollHeight leaves out the border; without it one line overflows and sits low in the box.
    editor.style.height = `${editor.scrollHeight + editor.offsetHeight - editor.clientHeight}px`;
    place(tools, editor.offsetLeft + 2, editor.offsetTop + editor.offsetHeight + 3);
  }

  function openEditor() {
    const b = boxNow(draft);
    const top = draftThread ? draftThread.offsetTop + draftThread.offsetHeight + 4 : b.y + b.h + 6;
    place(editor, b.x, top, 220);
    editor.placeholder = draft.reply ? 'Reply…' : 'Add an optional note…';
    editor.hidden = tools.hidden = false;
    delBtn.hidden = !draft.id;
    autosize();
    editor.focus({ preventScroll: true });
  }

  function closeEditor() {
    editor.hidden = tools.hidden = true;
    editor.blur();
  }

  function startDraft(d, text = '') {
    draft = d;
    editor.value = text;
  }

  function hitTest(p) {
    const pad = 6;
    const inside = (r) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
    return hits
      .filter((h) => h.m.id !== 'pending' && inside(h))
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
  }

  // The smallest elements under the box, so the agent can tell what was pointed at.
  function elementsIn(b) {
    const vx = b.x - scrollX;
    const vy = b.y - scrollY;
    const found = [];
    for (const e of document.querySelectorAll('body, body *')) {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const ow = Math.min(r.right, vx + b.w) - Math.max(r.left, vx);
      const oh = Math.min(r.bottom, vy + b.h) - Math.max(r.top, vy);
      if (ow > 0 && oh > 0) found.push({ e, r, frac: (ow * oh) / (r.width * r.height), area: ow * oh });
    }
    const parents = new Set();
    for (const h of found) for (let p = h.e.parentElement; p && !parents.has(p); p = p.parentElement) parents.add(p);
    let inner = found.filter((h) => !parents.has(h.e));
    // Drop layers far bigger than the mark (invisible overlays, page backgrounds) unless nothing else is there.
    const fits = inner.filter((h) => h.r.width * h.r.height <= b.w * b.h * 4);
    if (fits.length) inner = fits;
    const seen = new Set();
    return inner
      .sort((a, z) => z.frac - a.frac || z.area - a.area)
      .map((h) => describe(h.e))
      .filter((d) => !seen.has(d.selector + JSON.stringify(d.rect)) && seen.add(d.selector + JSON.stringify(d.rect)))
      .slice(0, 5);
  }

  function describe(e) {
    const r = e.getBoundingClientRect();
    return {
      selector: selectorOf(e),
      tag: e.localName,
      text: textOf(e),
      rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
    };
  }

  // How far a mark's element has moved since the mark was drawn (the layout changed, say after an
  // agent's edit), so the mark can move with it. The saved mark is never changed. Selectors may
  // match another element, so unless one is an id or test id, its tag and text must match too.
  // shortcut: follows moves, not resizes; scale the mark too if resized targets look off.
  const NO_SHIFT = { dx: 0, dy: 0 };
  function shiftOf(m) {
    for (const t of m.elements || []) {
      let e;
      try {
        e = document.querySelector(t.selector);
      } catch {
        continue;
      }
      if (!e || e.localName !== t.tag || (!/^(#|\[data-testid)/.test(t.selector) && textOf(e) !== t.text)) continue;
      const r = e.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      return { dx: Math.round(r.left + scrollX) - t.rect.x, dy: Math.round(r.top + scrollY) - t.rect.y };
    }
    return NO_SHIFT;
  }
  const boxNow = (m) => {
    const { dx, dy } = shifts.get(m.id) || NO_SHIFT;
    return { ...m.box, x: m.box.x + dx, y: m.box.y + dy };
  };

  // The page's own words in an area (page coordinates), in reading order: what a drawing circles or
  // underlines, or what a box holds. Form fields are skipped, so what's typed in them never leaves the page.
  function wordsIn(b) {
    const vx = b.x - scrollX;
    const vy = b.y - scrollY;
    const hit = (r) => r.width && r.right > vx && r.left < vx + b.w && r.bottom > vy && r.top < vy + b.h;
    const range = document.createRange();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const words = [];
    for (let n; (n = walk.nextNode()); ) {
      if (n.parentElement.closest('script, style, noscript, textarea, select')) continue;
      range.selectNodeContents(n);
      if (!hit(range.getBoundingClientRect())) continue;
      for (const w of n.data.matchAll(/\S+/g)) {
        range.setStart(n, w.index);
        range.setEnd(n, w.index + w[0].length);
        if (hit(range.getBoundingClientRect())) words.push(w[0]);
      }
    }
    return words.join(' ').slice(0, 300) || null;
  }

  // What a mark covers. annot doesn't guess what a drawing is (circle, underline, arrow, scribble): the agent
  // sees that in the capture. It gets the elements and words within 20px of the ink, since ink sits beside
  // what it marks (under a line of text, just short of a button).
  function targetOf(d) {
    const pad = d.kind === 'stroke' ? 20 : 0;
    const area = { x: d.box.x - pad, y: d.box.y - pad, w: d.box.w + 2 * pad, h: d.box.h + 2 * pad };
    return { elements: elementsIn(area), quote: wordsIn(area) };
  }

  // Form fields report their placeholder or name, never what's typed in them.
  const textOf = (e) =>
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName)
      ? e.placeholder || e.name || ''
      : (e.innerText ?? e.textContent) || e.getAttribute('aria-label') || e.getAttribute('alt') || e.getAttribute('title') || ''
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);

  // Short and readable rather than guaranteed unique; text and rect disambiguate.
  function selectorOf(e) {
    const parts = [];
    for (let i = 0; e && e !== document.documentElement && i < 4; e = e.parentElement, i++) {
      if (e.id && document.querySelectorAll(`#${CSS.escape(e.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(e.id)}`);
        break;
      }
      const tid = e.getAttribute('data-testid');
      if (tid) {
        parts.unshift(`[data-testid="${CSS.escape(tid)}"]`);
        break;
      }
      const classes = [...e.classList].filter((c) => !/^(css|sc|jsx)-/.test(c)).slice(0, 2);
      let s = e.localName + classes.map((c) => `.${CSS.escape(c)}`).join('');
      const same = e.parentElement ? [...e.parentElement.children].filter((c) => c.localName === e.localName) : [];
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
      parts.unshift(s);
    }
    return parts.join(' > ');
  }

  async function load() {
    const res = await send({ op: 'list', url: location.href });
    if (res?.ok) {
      marks = res.marks;
      error = '';
    } else {
      error = /not found/i.test(res?.error || '') ? 'native host missing: run ./install.sh host' : `error: ${res?.error || 'no response'}`;
    }
    render();
  }

  const viewportNow = () => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, scrollX: Math.round(scrollX), scrollY: Math.round(scrollY) });

  function markFrom(d, text) {
    const mark = d.id
      ? { ...d.orig, text, color: d.color }
      : {
          url: location.href,
          title: document.title,
          kind: d.kind,
          color: d.color,
          text,
          box: d.box,
          strokes: d.kind === 'stroke' ? d.strokes : null,
          ...targetOf(d),
        };
    mark.viewport = viewportNow();
    return mark;
  }

  let draftTimer;
  let draftNeedsCapture = false;
  let publishedDraft = false;

  // Replies aren't published as drafts: the agent already has the mark, and the reply arrives on save.
  function scheduleDraft(takeCapture = false) {
    draftNeedsCapture ||= takeCapture;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      if (!draft?.box || draft.reply || drag) return;
      const mark = markFrom(draft, editor.value.trim());
      publishedDraft = true;
      send({ op: 'draft', mark, takeCapture: draftNeedsCapture });
      draftNeedsCapture = false;
    }, takeCapture ? 120 : 220);
  }

  function discardPublishedDraft() {
    clearTimeout(draftTimer);
    draftNeedsCapture = false;
    if (!publishedDraft) return;
    publishedDraft = false;
    send({ op: 'draft' });
  }

  // Saves the mark (even with an empty note). On a mark the agent has answered, the text is a
  // follow-up added to its thread; the original note stays as written.
  async function commit() {
    const d = draft;
    if (!d) return;
    const text = editor.value.trim();
    draft = null;
    closeEditor();
    const recolored = d.id && d.color !== (d.orig.color || DEFAULT_COLOR);
    if (d.id && !recolored && (d.reply ? !text : text === d.orig.text)) {
      discardPublishedDraft();
      return render();
    }
    clearTimeout(draftTimer);
    draftNeedsCapture = false;
    publishedDraft = false;
    const mark = d.reply ? { ...d.orig, color: d.color, viewport: viewportNow(), ...(text && { followUp: text }) } : markFrom(d, text);
    recent = [mark.color, ...recent.filter((c) => c !== mark.color)].slice(0, 6);
    remember();
    // Show it (numbered, with any follow-up) before the capture is taken, without the bar and picker.
    const n = mark.n || Math.max(0, ...marks.map((m) => +m.n || 0)) + 1;
    const thread = mark.followUp ? [...(d.orig.thread || []), { from: 'user', text: mark.followUp }] : mark.thread;
    marks = [...marks.filter((m) => m.id !== mark.id), { ...mark, thread, id: mark.id || 'pending', n, status: 'open' }];
    bar.hidden = true;
    render();
    const undoOf = (r) => [{ url: r.mark.url, id: r.mark.id, before: d.id ? d.orig : null, after: r.mark.updated }];
    const res = await change({ op: 'save', mark }, undoOf, frames());
    bar.hidden = false;
    await load();
    if (!res?.ok) {
      error = `not saved: ${res?.error || 'no response'}`;
      render();
    }
  }

  async function del(m) {
    await change({ op: 'delete', url: m.url, id: m.id }, () => [{ url: m.url, id: m.id, before: m, after: null }]);
    await load();
  }

  // Undo history for this page: each entry is the marks one save, delete or Clear changed, as they
  // were before (`before`, null if new) and right after (`after`: updated time, null if deleted).
  // Changes and undos run one at a time, so ⌘Z right after Enter undoes that save. `ready` lets
  // a save join the queue at once but wait for the frame that shows it before the capture.
  const undos = [];
  let pending = Promise.resolve();
  const inOrder = (fn) => (pending = pending.catch(() => {}).then(fn));
  const change = (msg, undoOf, ready) =>
    inOrder(async () => {
      await ready;
      const res = await send(msg);
      if (res?.ok) undos.push(undoOf(res));
      return res;
    });
  const undoLast = () =>
    inOrder(async () => {
      const changes = undos.pop();
      if (!changes) return;
      const res = await send({ op: 'restore', changes });
      await load();
      if (!res?.ok) {
        error = `not undone: ${res?.error || 'no response'}`;
        render();
      }
    });

  // ⌘Z: drop the last stroke of a drawing in progress, cancel any other unsaved mark, or undo
  // the last save, delete or Clear. In a note with text, it undoes typing as usual.
  function undo() {
    if (drag) return;
    if (draft?.kind === 'stroke' && !draft.id && draft.strokes.length > 1) {
      draft.strokes.pop();
      draft.box = bounds(draft.strokes.flat());
      render();
      openEditor();
      scheduleDraft(true);
    } else if (draft) cancel();
    else undoLast();
  }

  function cancel() {
    draft = null;
    discardPublishedDraft();
    closeEditor();
    render();
  }

  catcher.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    catcher.setPointerCapture(e.pointerId);
    pickerOpen = confirming = false;
    const p = pt(e);
    // Shift-strokes in a row build one drawing (e.g. an arrow's shaft and head); anything else commits.
    const addStroke = e.shiftKey && draft?.kind === 'stroke' && !draft.id;
    if (draft && !addStroke) commit();
    else render();
    drag = { start: p, shift: e.shiftKey, moved: false, pts: [[p.x, p.y]] };
  });

  catcher.addEventListener('pointermove', (e) => {
    if (!drag) {
      catcher.style.cursor = hitTest(pt(e))?.fold ? 'pointer' : '';
      return;
    }
    const p = pt(e);
    if (!drag.moved) {
      if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 4) return;
      drag.moved = true;
      if (drag.shift) {
        if (!draft) startDraft({ kind: 'stroke', strokes: [], color });
        draft.strokes.push(drag.pts);
      } else {
        startDraft({ kind: 'box', color });
      }
    }
    if (drag.shift) {
      const last = drag.pts.at(-1);
      // Keep points at least 3px apart; a pause mid-stroke otherwise piles up duplicates.
      if (Math.hypot(p.x - last[0], p.y - last[1]) >= 3) drag.pts.push([p.x, p.y]);
    } else {
      draft.box = rectOf(drag.start, p);
    }
    render();
  });

  catcher.addEventListener('pointerup', () => {
    const d = drag;
    drag = null;
    if (!d) return;
    if (!d.moved) {
      const h = hitTest(d.start);
      if (h?.fold) {
        if (!folded.delete(h.m.id)) folded.add(h.m.id);
        folding = h.m.id;
        return render();
      }
      const hit = h?.m;
      if (hit) {
        // Once the agent has answered (or resolved) a mark, typing adds a follow-up instead of editing the note.
        const reply = hit.thread?.length > 0 || hit.status === 'resolved';
        const d2 = { kind: hit.kind, box: hit.box, strokes: hit.strokes, color: hit.color || DEFAULT_COLOR, id: hit.id, orig: hit, reply };
        startDraft(d2, reply ? '' : hit.text);
        render();
        openEditor();
      }
      return;
    }
    if (d.shift) draft.box = bounds(draft.strokes.flat());
    else if (draft.box.w < 8 || draft.box.h < 8) return cancel();
    render();
    openEditor();
    scheduleDraft(true);
  });

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (pickerOpen || confirming) {
        pickerOpen = confirming = false;
        render();
      } else if (draft) cancel();
      else toggle();
    } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && draft && shadow.activeElement === editor) {
      e.preventDefault();
      e.stopImmediatePropagation();
      commit();
    } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
      if (shadow.activeElement === editor && editor.value) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      undo();
    }
  }

  async function toggle() {
    if (on && draft) await commit();
    on = !on;
    pickerOpen = confirming = false;
    host.style.display = on ? '' : 'none';
    send({ op: 'mode', on, open: openNow() });
    if (on) {
      addEventListener('keydown', onKey, true);
      pathname = location.pathname;
      load();
    } else {
      removeEventListener('keydown', onKey, true);
    }
  }

  // Coming back to the tab (say, from the terminal) picks up the agent's replies.
  const refresh = () => {
    if (on && !drag && document.visibilityState === 'visible') load();
  };
  addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  // Back/forward can restore this page with the overlay on but the toolbar icon reset.
  const reshow = (e) => e.persisted && on && send({ op: 'mode', on, open: openNow() });
  addEventListener('pageshow', reshow);

  // Every half second: remove this overlay once the extension reloads (the new one runs in a fresh
  // isolated world and can't reach this one), redraw marks whose element moved, and follow
  // single-page apps that change path without reloading.
  const moved = () => marks.some((m) => {
    const was = shifts.get(m.id) || NO_SHIFT;
    const now = shiftOf(m);
    return now.dx !== was.dx || now.dy !== was.dy;
  });
  const timer = setInterval(() => {
    if (!chrome.runtime?.id) {
      clearInterval(timer);
      removeEventListener('keydown', onKey, true);
      removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      removeEventListener('pageshow', reshow);
      return host.remove();
    }
    if (on && !drag && moved()) render();
    if (!on || location.pathname === pathname) return;
    pathname = location.pathname;
    undos.length = 0;
    cancel();
    load();
  }, 500);

  window.__annot = { toggle, alive: () => !!chrome.runtime?.id, on: () => on };
  toggle();
})();
