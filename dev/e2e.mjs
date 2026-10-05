// Loads the real extension in headless Chrome and drives it over the devtools
// protocol. Run with: CHROME_BIN=/path/to/chromium npm run e2e
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, rmSync, readFileSync, writeFileSync, appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC = join(import.meta.dirname, '..');
// optional: a folder to drop screenshots into
const OUT = process.env.OUT_DIR;
// Chrome for Testing or Chromium. Branded Chrome ignores --load-extension.
const CHROME = process.env.CHROME_BIN;
if (!CHROME) {
  console.error('set CHROME_BIN to a Chrome for Testing or Chromium binary');
  process.exit(2);
}
const PORT = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// patched copy: activeTab needs a real key press, so the test grants host access instead
const work = mkdtempSync(join(tmpdir(), 'cmdk-e2e-'));
const ext = join(work, 'ext');
cpSync(SRC, ext, { recursive: true, filter: (p) => !/\/(\.git|node_modules|docs)(\/|$)/.test(p) });
const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['<all_urls>'];
writeFileSync(join(ext, 'manifest.json'), JSON.stringify(manifest));
appendFileSync(join(ext, 'background.js'), '\nglobalThis.__toggle = toggle;\n');

const page = (title, body, extra = '') =>
  `<!doctype html><html><head><title>${title}</title>${extra}</head><body style="font:16px system-ui;padding:40px"><h1>${title}</h1>${body}</body></html>`;
const server = createServer((req, res) => {
  const headers = { 'content-type': 'text/html' };
  if (req.url.startsWith('/strict')) {
    headers['content-security-policy'] = "default-src 'none'; frame-src 'none'; style-src 'none'; img-src 'none'; script-src 'none'";
    res.writeHead(200, headers).end(page('Strict CSP page', '<p>locked down</p><input id="field" autofocus>'));
  } else if (req.url.startsWith('/dark')) {
    res.writeHead(200, headers).end(page('Dark scheme page', '<p>dark</p>', '<meta name="color-scheme" content="dark"><style>:root{color-scheme:dark}</style>'));
  } else if (req.url.startsWith('/hostile')) {
    res.writeHead(200, headers).end(
      page('Hostile page', '<input id="field"><div style="position:fixed;inset:0;z-index:2147483647;background:rgba(255,0,0,.2)">max z-index overlay</div>', '<style>*{display:block!important;all:revert}iframe{display:none!important;opacity:0!important}</style><script>addEventListener("keydown",e=>{window.__keys=(window.__keys||0)+1;e.stopImmediatePropagation();e.preventDefault()},true)</script>'),
    );
  } else {
    res.writeHead(200, headers).end(page(`Page ${req.url}`, '<p>hello</p><input id="field">'));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--user-data-dir=${join(work, 'profile')}`,
    `--remote-debugging-port=${PORT}`,
    `--load-extension=${ext}`,
    `--disable-extensions-except=${ext}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,800',
    `${base}/one`,
  ],
  { stdio: 'ignore' },
);

class Session {
  constructor(url) {
    this.id = 0;
    this.pending = new Map();
    this.ws = new WebSocket(url);
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
    };
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  close() {
    this.ws.close();
  }
}

const targets = async () => (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const waitFor = async (fn, ms = 6000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await sleep(100);
  }
  return null;
};
const findTarget = (pred, ms) => waitFor(async () => (await targets()).find(pred), ms);
const shot = async (session, name) => {
  if (!OUT) return;
  const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
};
const type = async (session, text) => {
  for (const ch of text) await session.send('Input.dispatchKeyEvent', { type: 'char', text: ch });
};
const press = async (session, key, code, vk, modifiers = 0) => {
  for (const t of ['rawKeyDown', 'keyUp']) {
    await session.send('Input.dispatchKeyEvent', { type: t, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  }
};

try {
  const swTarget = await findTarget((t) => t.type === 'service_worker' && t.url.includes('background.js'), 15000);
  check('service worker registered', !!swTarget, swTarget?.url);
  if (!swTarget) throw new Error('extension did not load');
  const extId = new URL(swTarget.url).host;
  const sw = new Session(swTarget.webSocketDebuggerUrl);

  const cmds = (await waitFor(() => sw.eval('chrome.commands ? chrome.commands.getAll().then(c => JSON.stringify(c)) : ""'))) || 'missing';
  check('command registered', cmds.includes('toggle-palette'), cmds);

  // a few more tabs so there is something to search
  await sw.eval(`Promise.all(['two','three?q=helm-charts','dark'].map(p => chrome.tabs.create({url: '${base}/' + p, active: false}))).then(() => 1)`);
  await sleep(600);

  const pageTarget = await findTarget((t) => t.type === 'page' && t.url === `${base}/one`);
  const pg = new Session(pageTarget.webSocketDebuggerUrl);
  await pg.send('Page.bringToFront');
  await pg.eval('document.getElementById("field").focus(), 1');

  const toggle = (tabUrl) =>
    sw.eval(`chrome.tabs.query({}).then(ts => __toggle(ts.find(t => t.url === ${JSON.stringify(tabUrl)}))).then(() => 1)`);

  // --- overlay on a normal page
  await toggle(`${base}/one`);
  const hostShown = await waitFor(() => pg.eval(`(() => { const h = document.querySelector('command-k-root'); return h && getComputedStyle(h).display === 'block'; })()`));
  check('overlay host shown', !!hostShown);
  const inTopLayer = await pg.eval(`document.querySelector('command-k-root').matches(':popover-open')`);
  check('overlay is in the top layer', inTopLayer);

  const frameTarget = await findTarget((t) => t.url.startsWith(`chrome-extension://${extId}/palette.html`));
  check('palette frame loaded', !!frameTarget, frameTarget?.type);
  const fr = new Session(frameTarget.webSocketDebuggerUrl);
  const opened = await waitFor(() => fr.eval(`document.getElementById('app').classList.contains('open')`));
  check('palette opened', !!opened);
  const info = async () =>
    JSON.parse(
      await fr.eval(`JSON.stringify({
        rows: [...document.querySelectorAll('.row')].map(r => r.className.replace('row ','') + ':' + r.querySelector('.title').textContent),
        sections: [...document.querySelectorAll('.sec')].map(s => s.textContent),
        focused: document.activeElement?.className,
        hasFocus: document.hasFocus(),
        theme: document.documentElement.dataset.theme,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        query: document.querySelector('.query').value,
        selected: document.querySelector('[aria-selected=true] .title')?.textContent,
        icons: [...document.querySelectorAll('.lead img')].map(i => i.naturalWidth),
      })`),
    );
  let s = await info();
  console.log(JSON.stringify(s, null, 1));
  check('lists the open tabs', s.rows.filter((r) => r.startsWith('tab:')).length === 4, `${s.rows.length} rows`);
  check('current tab is listed last', s.rows.filter((r) => r.startsWith('tab:')).at(-1) === 'tab:Page /one');
  check('input focused', s.focused === 'query' && s.hasFocus);
  check('iframe body is transparent', s.bodyBg === 'rgba(0, 0, 0, 0)', s.bodyBg);
  check('favicons load from the extension', s.icons.length > 0 && s.icons.every((w) => w > 0), s.icons.join(','));
  await sleep(250);
  await shot(pg, 'e2e-1-overlay.png');

  // --- typing filters and reaches history
  await type(pg, 'helm');
  await sleep(500);
  s = await info();
  console.log(JSON.stringify(s.rows), s.sections);
  check('typing reaches the palette input', s.query === 'helm', s.query);
  check('finds the tab by url', s.rows[0] === 'tab:Page /three?q=helm-charts', s.rows[0]);
  check('offers a web search', s.rows.at(-1).startsWith('search:'));
  await shot(pg, 'e2e-2-search.png');

  // --- enter switches tabs and hides the overlay
  await press(pg, 'Enter', 'Enter', 13);
  await sleep(500);
  const active = await sw.eval('chrome.tabs.query({active: true, lastFocusedWindow: true}).then(t => t[0].url)');
  check('enter switches to the tab', active === `${base}/three?q=helm-charts`, active);
  const hidden = await pg.eval(`getComputedStyle(document.querySelector('command-k-root')).display`);
  check('overlay hidden after switching', hidden === 'none', hidden);

  // --- reopen on the same page reuses the frame, escape closes, focus returns
  await pg.send('Page.bringToFront');
  await sw.eval(`chrome.tabs.query({}).then(ts => chrome.tabs.update(ts.find(t => t.url === '${base}/one').id, {active: true})).then(() => 1)`);
  await sleep(300);
  await toggle(`${base}/one`);
  await waitFor(() => fr.eval(`document.getElementById('app').classList.contains('open')`));
  s = await info();
  check('reopens with a clean query', s.query === '' && s.rows.length >= 4, `${s.query}|${s.rows.length}`);
  await type(pg, '>dup');
  await sleep(300);
  s = await info();
  check('> switches to actions', s.sections.join() === 'Actions' && s.selected === 'Duplicate tab', `${s.sections}|${s.selected}`);
  await press(pg, 'Escape', 'Escape', 27);
  await sleep(400);
  const afterEsc = await pg.eval(`JSON.stringify({display: getComputedStyle(document.querySelector('command-k-root')).display, focus: document.activeElement.id})`);
  check('escape closes and restores page focus', afterEsc === '{"display":"none","focus":"field"}', afterEsc);

  // --- toggling twice closes
  await toggle(`${base}/one`);
  await waitFor(() => fr.eval(`document.getElementById('app').classList.contains('open')`));
  await toggle(`${base}/one`);
  await sleep(400);
  check('second toggle closes', (await pg.eval(`getComputedStyle(document.querySelector('command-k-root')).display`)) === 'none');
  fr.close();

  // --- dark color-scheme page: frame must stay transparent
  const darkTarget = await findTarget((t) => t.type === 'page' && t.url === `${base}/dark`);
  const dk = new Session(darkTarget.webSocketDebuggerUrl);
  await dk.send('Page.bringToFront');
  await sw.eval(`chrome.tabs.query({}).then(ts => chrome.tabs.update(ts.find(t => t.url === '${base}/dark').id, {active: true})).then(() => 1)`);
  await dk.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await toggle(`${base}/dark`);
  await waitFor(() => dk.eval(`getComputedStyle(document.querySelector('command-k-root')).display === 'block'`));
  await sleep(700);
  await shot(dk, 'e2e-3-dark-page.png');
  const darkFrames = (await targets()).filter((t) => t.url.startsWith(`chrome-extension://${extId}/palette.html`));
  let darkTheme = null;
  for (const t of darkFrames) {
    const f = new Session(t.webSocketDebuggerUrl);
    const v = await f.eval(`document.getElementById('app').classList.contains('open') ? document.documentElement.dataset.theme : ''`).catch(() => '');
    if (v) darkTheme = v;
    f.close();
  }
  check('follows the dark preference passed from the page', darkTheme === 'dark', String(darkTheme));
  await press(dk, 'Escape', 'Escape', 27);

  // --- strict CSP page
  await sw.eval(`chrome.tabs.create({url: '${base}/strict', active: true}).then(() => 1)`);
  const strictTarget = await findTarget((t) => t.type === 'page' && t.url === `${base}/strict`);
  const st = new Session(strictTarget.webSocketDebuggerUrl);
  await st.send('Page.bringToFront');
  await sleep(400);
  await toggle(`${base}/strict`);
  const strictShown = await waitFor(() => st.eval(`getComputedStyle(document.querySelector('command-k-root')).display === 'block'`), 4000);
  check('works on a page with a strict CSP', !!strictShown);
  await sleep(400);
  await shot(st, 'e2e-4-strict-csp.png');
  await press(st, 'Escape', 'Escape', 27);

  // --- hostile page: aggressive css, max z-index overlay, capture-phase key trap
  await sw.eval(`chrome.tabs.create({url: '${base}/hostile', active: true}).then(() => 1)`);
  const hostileTarget = await findTarget((t) => t.type === 'page' && t.url === `${base}/hostile`);
  const ho = new Session(hostileTarget.webSocketDebuggerUrl);
  await ho.send('Page.bringToFront');
  await sleep(400);
  await toggle(`${base}/hostile`);
  const hostileShown = await waitFor(() => ho.eval(`getComputedStyle(document.querySelector('command-k-root')).display === 'block'`), 4000);
  check('shows on a page with hostile css', !!hostileShown);
  await sleep(500);
  await type(ho, 'strict');
  await sleep(400);
  await shot(ho, 'e2e-5-hostile.png');
  const leaked = await ho.eval('window.__keys || 0');
  check('page key handlers never see palette keystrokes', leaked === 0, `${leaked} leaked`);
  await press(ho, 'Escape', 'Escape', 27);

  // --- restricted page falls back to popup or window
  await sw.eval(`chrome.tabs.create({url: 'chrome://version', active: true}).then(() => 1)`);
  await sleep(600);
  await sw.eval(`chrome.tabs.query({}).then(ts => __toggle(ts.find(t => t.url.startsWith('chrome://version')))).then(() => 1)`);
  const fallback = await findTarget((t) => t.url.startsWith(`chrome-extension://${extId}/palette.html`) && (t.type === 'page' || t.url.includes('mode=window')), 5000);
  check('restricted page opens the fallback surface', !!fallback, fallback?.url);
  if (fallback) {
    const fb = new Session(fallback.webSocketDebuggerUrl);
    const rows = await waitFor(() => fb.eval(`document.querySelectorAll('.row').length`));
    const mode = await fb.eval(`document.getElementById('app').dataset.mode`);
    check('fallback surface lists tabs', rows > 0, `${rows} rows, mode=${mode}`);
    await shot(fb, 'e2e-6-fallback.png').catch((e) => console.log('no fallback screenshot:', e.message));
    fb.close();
  }
} catch (err) {
  check(`uncaught: ${err.message}`, false);
} finally {
  chrome.kill('SIGKILL');
  server.close();
  await sleep(300);
  rmSync(work, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
