// The settings page: a recorder for the shortcut, and a pointer to the
// browser's own optional shortcut, which only the browser can set.
import { fromEvent, isValid, keycaps, defaultShortcut, same } from './shortcut.js';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const DEFAULT = defaultShortcut(isMac);
const ALL_SITES = { origins: ['<all_urls>'] };
const SHORTCUTS_URL = 'chrome://extensions/shortcuts';

const $ = (id) => document.getElementById(id);
const recorder = $('recorder');
const statusEl = $('status');
const saveBtn = $('save');
const cancelBtn = $('cancel');
const resetBtn = $('reset');

// draft: recorded but not saved. held: modifiers down while recording.
// granted: false once site access has been restricted in the browser's settings.
const state = { saved: DEFAULT, draft: null, recording: false, held: null, granted: true, status: null };

const el = (tag, className, text = '') => Object.assign(document.createElement(tag), { className, textContent: text });

function status() {
  if (state.status) return state.status;
  if (state.recording) return { text: 'Press the keys you want. Esc cancels.' };
  if (state.draft) return { text: 'Save to start using it.' };
  if (!state.granted) return { tone: 'bad', text: "Site access is restricted for Command K, so pages can't hear this." };
  return { text: 'Works on any web page. Click it to change.' };
}

function render() {
  const { saved, draft, recording, held } = state;
  recorder.dataset.state = recording ? 'recording' : draft ? 'draft' : 'saved';

  const caps = keycaps(recording ? held || {} : draft || saved, isMac);
  const keys = caps.map((cap) => el('kbd', 'cap', cap));
  if (!keys.length) keys.push(el('span', 'ghost', 'Press a shortcut'));
  else if (recording) keys.push(el('kbd', 'cap blank'));
  recorder.replaceChildren(...keys);
  recorder.setAttribute('aria-label', `Shortcut, ${recording ? 'recording' : caps.join(' ')}`);

  const { tone, text } = status();
  statusEl.textContent = text;
  statusEl.dataset.tone = tone || '';

  saveBtn.hidden = cancelBtn.hidden = recording || !draft;
  resetBtn.hidden = recording || !!draft || same(saved, DEFAULT);
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

async function store(shortcut) {
  // nothing stored means the default
  if (same(shortcut, DEFAULT)) await chrome.storage.local.remove('shortcut');
  else await chrome.storage.local.set({ shortcut });
  Object.assign(state, { saved: shortcut, draft: null, status: { text: 'Saved. Try it on any web page.' } });
  render();
  recorder.focus();
}

// both can change in the browser's own settings while this page is in the background
async function refresh() {
  const [granted, commands] = await Promise.all([chrome.permissions.contains(ALL_SITES), chrome.commands.getAll()]);
  const browser = commands.find((c) => c.name === 'toggle-palette')?.shortcut;
  state.granted = granted;
  $('browser-keys').textContent = browser || 'Not set';
  $('browser-change').textContent = browser ? 'Change' : 'Set';
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
saveBtn.addEventListener('click', () => store(state.draft));
resetBtn.addEventListener('click', () => store(DEFAULT));
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
state.saved = stored.shortcut || DEFAULT;
refresh();
