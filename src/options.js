// The settings page: a recorder for the custom shortcut, and a pointer to the
// browser's own shortcut, which only the browser can change.
import { fromEvent, isValid, keycaps } from './shortcut.js';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const ALL_SITES = { origins: ['<all_urls>'] };
const SHORTCUTS_URL = 'chrome://extensions/shortcuts';

const $ = (id) => document.getElementById(id);
const recorder = $('recorder');
const statusEl = $('status');
const saveBtn = $('save');
const cancelBtn = $('cancel');
const removeBtn = $('remove');

// draft: recorded but not saved. held: modifiers down while recording.
// granted: whether the browser lets the key listener run on pages.
const state = { saved: null, draft: null, recording: false, held: null, granted: false, status: null };

const el = (tag, className, text = '') => Object.assign(document.createElement(tag), { className, textContent: text });

function status() {
  const { saved, draft, recording, granted } = state;
  if (state.status) return state.status;
  if (recording) return { text: 'Press the keys you want. Esc cancels.' };
  if (draft && granted) return { text: 'Save to start using it.' };
  if (draft) return { text: 'Saving asks the browser for access to all sites. Command K only uses it to listen for this shortcut.' };
  if (saved && !granted) return { tone: 'bad', text: "Site access is off, so this shortcut isn't listening." };
  if (saved) return { text: 'Works on any web page. Click it to change.' };
  return { text: 'Click to record one.' };
}

function render() {
  const { saved, draft, recording, held } = state;
  const off = !!saved && !state.granted;
  recorder.dataset.state = recording ? 'recording' : draft ? 'draft' : saved ? 'saved' : 'empty';

  const caps = keycaps((recording ? held : draft || saved) || {}, isMac);
  const keys = caps.map((cap) => el('kbd', 'cap', cap));
  if (recording && keys.length) keys.push(el('kbd', 'cap blank'));
  if (!keys.length) keys.push(el('span', 'ghost', recording ? 'Press a shortcut' : 'Record a shortcut'));
  recorder.replaceChildren(...keys);
  recorder.setAttribute('aria-label', `Shortcut, ${recording ? 'recording' : caps.join(' ') || 'not set'}`);

  const { tone, text } = status();
  statusEl.textContent = text;
  statusEl.dataset.tone = tone || '';

  saveBtn.hidden = recording || !(draft || off);
  saveBtn.textContent = draft ? 'Save' : 'Turn on';
  cancelBtn.hidden = recording || !draft;
  removeBtn.hidden = recording || !!draft || !saved;
}

function record(on) {
  Object.assign(state, { recording: on, held: null, status: null });
  render();
}

function reject() {
  state.status = { tone: 'bad', text: `Add ${isMac ? '⌘, ⌃ or ⌥' : 'Ctrl or Alt'} so it can't fire while you type.` };
  render();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    recorder.animate({ transform: ['none', 'translateX(-5px)', 'translateX(5px)', 'none'] }, 200);
  }
}

function onKeydown(e) {
  if (!state.recording || e.isComposing) return;
  const combo = fromEvent(e);
  const plain = !combo.ctrl && !combo.meta && !combo.alt;
  // leave tab alone so the keyboard can still get past the recorder
  if (plain && e.key === 'Tab') return;
  e.preventDefault();
  if (e.repeat) return;
  if (plain && e.key === 'Escape') {
    record(false);
  } else if (!combo.code) {
    Object.assign(state, { held: combo, status: null });
    render();
  } else if (!isValid(combo)) {
    reject();
  } else {
    state.draft = combo;
    record(false);
    saveBtn.focus();
  }
}

async function save() {
  const shortcut = state.draft || state.saved;
  // the browser only shows its prompt when asked from the click itself
  state.granted = await chrome.permissions.request(ALL_SITES).catch(() => false);
  if (!state.granted) {
    state.status = { tone: 'bad', text: "It can't listen for the shortcut without site access." };
    render();
    return;
  }
  await chrome.storage.local.set({ shortcut });
  Object.assign(state, { saved: shortcut, draft: null, status: { text: 'Saved. Try it on any web page.' } });
  render();
  recorder.focus();
}

async function remove() {
  await chrome.storage.local.remove('shortcut');
  // hand site access back with it. fails when the browser granted it some other way
  await chrome.permissions.remove(ALL_SITES).catch(() => {});
  Object.assign(state, { saved: null, status: null });
  await refresh();
  recorder.focus();
}

// both can change in the browser's own settings while this page is in the background
async function refresh() {
  const [granted, commands] = await Promise.all([chrome.permissions.contains(ALL_SITES), chrome.commands.getAll()]);
  state.granted = granted;
  $('browser-keys').textContent = commands.find((c) => c.name === 'toggle-palette')?.shortcut || 'Not set';
  render();
}

function applyTheme(theme) {
  const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

recorder.addEventListener('click', () => state.recording || record(true));
recorder.addEventListener('blur', () => state.recording && record(false));
recorder.addEventListener('keydown', onKeydown);
recorder.addEventListener('keyup', (e) => {
  if (!state.recording) return;
  state.held = { ...fromEvent(e), code: '', label: '' };
  render();
});
saveBtn.addEventListener('click', save);
removeBtn.addEventListener('click', remove);
cancelBtn.addEventListener('click', () => {
  Object.assign(state, { draft: null, status: null });
  render();
  recorder.focus();
});
// a link to a chrome:// page goes nowhere, the tabs api can open it
$('browser-change').addEventListener('click', () => chrome.tabs.create({ url: SHORTCUTS_URL }));
window.addEventListener('focus', refresh);

applyTheme();
const stored = await chrome.storage.local.get(['shortcut', 'theme']);
applyTheme(stored.theme);
state.saved = stored.shortcut ?? null;
refresh();
