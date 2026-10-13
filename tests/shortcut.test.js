import test from 'node:test';
import assert from 'node:assert/strict';
import { fromEvent, isValid, matches, keycaps, defaultShortcut, same } from '../src/shortcut.js';

const key = (code, k, mods = {}) => ({ code, key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

test('records the physical key and the modifiers held with it', () => {
  assert.deepEqual(fromEvent(key('KeyJ', 'j', { metaKey: true, shiftKey: true })), {
    code: 'KeyJ',
    label: 'J',
    ctrl: false,
    meta: true,
    alt: false,
    shift: true,
  });
});

test('a modifier on its own is not a key yet', () => {
  const held = fromEvent(key('MetaLeft', 'Meta', { metaKey: true }));
  assert.equal(held.code, '');
  assert.equal(isValid(held), false);
  assert.deepEqual(keycaps(held, true), ['⌘']);
});

test('needs ctrl, alt or cmd so it cannot fire while typing', () => {
  assert.equal(isValid(fromEvent(key('KeyJ', 'j'))), false);
  assert.equal(isValid(fromEvent(key('KeyJ', 'J', { shiftKey: true }))), false);
  assert.equal(isValid(fromEvent(key('KeyJ', 'j', { altKey: true }))), true);
  assert.equal(isValid(undefined), false);
});

test('labels follow the layout, and fall back to the key when it types a symbol', () => {
  // dvorak: the key in the qwerty V position types K
  assert.equal(fromEvent(key('KeyV', 'k', { ctrlKey: true })).label, 'K');
  // option turns K into a symbol on mac
  assert.equal(fromEvent(key('KeyK', '˚', { altKey: true })).label, 'K');
  assert.equal(fromEvent(key('Digit1', '!', { ctrlKey: true, shiftKey: true })).label, '1');
  assert.equal(fromEvent(key('Space', ' ', { altKey: true })).label, 'Space');
  assert.equal(fromEvent(key('Slash', '/', { metaKey: true })).label, '/');
  assert.equal(fromEvent(key('F5', 'F5', { ctrlKey: true })).label, 'F5');
  assert.equal(fromEvent(key('Numpad0', '0', { ctrlKey: true })).label, '0');
  assert.equal(fromEvent(key('NumpadAdd', '+', { ctrlKey: true })).label, 'Num Add');
});

test('matches only the exact combo', () => {
  const saved = fromEvent(key('KeyK', '˚', { altKey: true }));
  assert.ok(matches(saved, key('KeyK', '˚', { altKey: true })));
  assert.ok(!matches(saved, key('KeyK', 'k')));
  assert.ok(!matches(saved, key('KeyK', '', { altKey: true, shiftKey: true })));
  assert.ok(!matches(saved, key('KeyJ', '∆', { altKey: true })));
  assert.ok(!matches(undefined, key('KeyK', 'k', { altKey: true })));
});

test('defaults to cmd+k on mac and ctrl+k elsewhere', () => {
  assert.deepEqual(keycaps(defaultShortcut(true), true), ['⌘', 'K']);
  assert.deepEqual(keycaps(defaultShortcut(false), false), ['Ctrl', 'K']);
  assert.ok(matches(defaultShortcut(true), key('KeyK', 'k', { metaKey: true })));
  assert.ok(isValid(defaultShortcut(false)));
});

test('recording the default again is the same shortcut', () => {
  assert.ok(same(fromEvent(key('KeyK', 'k', { metaKey: true })), defaultShortcut(true)));
  assert.ok(!same(fromEvent(key('KeyK', 'k', { metaKey: true, shiftKey: true })), defaultShortcut(true)));
  assert.ok(!same(defaultShortcut(true), defaultShortcut(false)));
});

test('writes modifiers the way the platform does', () => {
  const combo = fromEvent(key('KeyK', 'k', { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true }));
  assert.deepEqual(keycaps(combo, true), ['⌃', '⌥', '⇧', '⌘', 'K']);
  assert.deepEqual(keycaps(combo, false), ['Ctrl', 'Alt', 'Shift', 'Meta', 'K']);
});
