// The custom shortcut: a key plus modifiers, stored as plain data. Pure
// functions over event-shaped objects so it runs under node for tests.

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'AltGraph', 'Shift', 'CapsLock', 'Fn', 'OS']);
const MAC = [['ctrl', '⌃'], ['alt', '⌥'], ['shift', '⇧'], ['meta', '⌘']];
const OTHER = [['ctrl', 'Ctrl'], ['alt', 'Alt'], ['shift', 'Shift'], ['meta', 'Meta']];
const NAMED = {
  Space: 'Space',
  Enter: '↵',
  Tab: '⇥',
  Escape: 'Esc',
  Backspace: '⌫',
  Delete: '⌦',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

function label(e) {
  // what the layout types, so dvorak and azerty read right. shift and alt turn
  // it into a symbol, and then the physical key is the better name
  if (/^[a-z0-9]$/i.test(e.key)) return e.key.toUpperCase();
  return NAMED[e.code] ?? e.code.replace(/^(Key|Digit)/, '').replace(/^Numpad/, 'Num ');
}

/** The combo held in a keydown. `code` is empty while only modifiers are down. */
export function fromEvent(e) {
  const bare = MODIFIER_KEYS.has(e.key);
  return {
    code: bare ? '' : e.code,
    label: bare ? '' : label(e),
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    alt: e.altKey,
    shift: e.shiftKey,
  };
}

// shift alone doesn't count, or the shortcut would fire while typing
export const isValid = (s) => !!s?.code && (s.ctrl || s.meta || s.alt);

// matched on the physical key, which stays put when a modifier changes what it types
export const matches = (s, e) =>
  !!s && e.code === s.code && e.ctrlKey === s.ctrl && e.metaKey === s.meta && e.altKey === s.alt && e.shiftKey === s.shift;

/** One label per key, in the order the platform writes them. */
export function keycaps(s, isMac) {
  const caps = (isMac ? MAC : OTHER).filter(([mod]) => s[mod]).map(([, name]) => name);
  if (s.label) caps.push(s.label);
  return caps;
}
