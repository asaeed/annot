#!/usr/bin/env node
// annot CLI for agents, and the Chrome native messaging host (Chrome passes the
// extension origin as the first argument).
import * as store from '../lib/store.js';

const HELP = `annot: read and resolve marks placed with the annot Chrome extension

  annot pull [url-prefix] [--all]   open marks and drafts as JSON (--all includes resolved);
                                    marks added or edited since the last pull have "new": true
  annot resolve <id> [reply...]     mark resolved with a one-line reply

Marks live in ${store.root()}/<host>/<id>.json, with a viewport capture in <id>.png.`;

const [cmd, ...args] = process.argv.slice(2);

if (cmd?.startsWith('chrome-extension://')) native();
else {
  try {
    if (cmd === 'pull') {
      const prefix = args.find((a) => !a.startsWith('--'));
      console.log(JSON.stringify(store.pull(prefix, { all: args.includes('--all') }), null, 2));
    } else if (cmd === 'resolve' && args[0]) {
      const m = store.resolve(args[0], args.slice(1).join(' '));
      console.log(`resolved #${m.n} ${m.url}`);
    } else {
      console.log(HELP);
      if (cmd && !['help', '--help', '-h'].includes(cmd)) process.exitCode = 2;
    }
  } catch (e) {
    console.error(`annot: ${e.message}`);
    process.exitCode = 1;
  }
}

function handle(msg) {
  switch (msg.op) {
    case 'list':
      return store.list(msg.url);
    case 'save': {
      const mark = store.save(msg.mark, msg.capture, msg.tabId);
      if (msg.tabId !== undefined) store.publishDraft(msg.tabId, null);
      return { mark };
    }
    case 'draft':
      store.publishDraft(msg.tabId, msg.mark, msg.capture);
      return {};
    case 'clear-drafts':
      store.clearDrafts();
      return {};
    case 'delete':
      store.remove(msg.url, msg.id);
      return {};
    case 'clear':
      return { cleared: store.clear(msg.url) };
    case 'restore':
      store.restore(msg.changes);
      return {};
    case 'hosts':
      return { hosts: store.hosts() };
    default:
      throw new Error(`unknown op ${msg.op}`);
  }
}

// One framed message in (4-byte little-endian length + JSON), one framed reply out, then exit.
function native() {
  let buf = Buffer.alloc(0);
  process.stdin.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (buf.length < 4 || buf.length < 4 + buf.readUInt32LE(0)) return;
    process.stdin.pause();
    let res;
    try {
      res = { ok: true, ...handle(JSON.parse(buf.subarray(4, 4 + buf.readUInt32LE(0)).toString('utf8'))) };
    } catch (e) {
      res = { ok: false, error: e.message };
    }
    const body = Buffer.from(JSON.stringify(res));
    const head = Buffer.alloc(4);
    head.writeUInt32LE(body.length);
    process.stdout.write(Buffer.concat([head, body]), () => process.exit(0));
  });
}
