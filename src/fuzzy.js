// Small fuzzy matcher. A contiguous substring always beats a scattered
// subsequence, and matches that start on a word boundary beat ones that don't.

const MAX_LOOSE_GAP = 3;
const SEPARATORS = new Uint8Array(128);
for (const ch of ' \t/\\-_.:,;|()[]{}#?&=+@~\'"<>') SEPARATORS[ch.charCodeAt(0)] = 1;

export function isBoundary(text, i) {
  if (i === 0) return true;
  const prev = text.charCodeAt(i - 1);
  if (prev < 128 && SEPARATORS[prev]) return true;
  const cur = text.charCodeAt(i);
  // camelCase: lower followed by upper
  return cur >= 65 && cur <= 90 && prev >= 97 && prev <= 122;
}

// earliest complete match, then walked backwards to its tightest start
function tightAlignment(needle, lower) {
  const n = needle.length;
  let k = 0;
  let end = -1;
  for (let i = 0; i < lower.length; i++) {
    if (lower.charCodeAt(i) === needle.charCodeAt(k) && ++k === n) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const pos = new Array(n);
  k = n - 1;
  for (let i = end; i >= 0 && k >= 0; i--) {
    if (lower.charCodeAt(i) === needle.charCodeAt(k)) pos[k--] = i;
  }
  return pos;
}

// prefers word starts, so "gpr" lands on "GitHub Pull Requests"
function boundaryAlignment(needle, text, lower) {
  const n = needle.length;
  const pos = new Array(n);
  let from = 0;
  for (let k = 0; k < n; k++) {
    const first = lower.indexOf(needle[k], from);
    if (first < 0) return null;
    let pick = first;
    if (!(k > 0 && first === pos[k - 1] + 1)) {
      let j = first;
      for (let tries = 0; j >= 0 && tries < 16; tries++) {
        if (isBoundary(text, j)) {
          pick = j;
          break;
        }
        j = lower.indexOf(needle[k], j + 1);
      }
    }
    pos[k] = pick;
    from = pick + 1;
  }
  return pos;
}

// A letter is anchored when it starts a word or continues a run. Short queries
// need every letter anchored, longer ones may skip a few characters here and
// there. Without this, three letters match almost any title.
function scoreAlignment(text, pos) {
  const n = pos.length;
  let score = 0;
  let anchored = 0;
  let prev = -2;
  for (let k = 0; k < n; k++) {
    const p = pos[k];
    const boundary = isBoundary(text, p);
    const consecutive = p === prev + 1;
    const gap = p - prev - 1;
    if (boundary || consecutive) anchored++;
    else if (gap > MAX_LOOSE_GAP) return null;
    score += 10;
    if (boundary) score += p === 0 ? 13 : 9;
    if (consecutive) score += 7;
    else if (k > 0) score -= Math.min(gap, 12) * 0.6;
    prev = p;
  }
  if (anchored < (n <= 3 ? n : Math.ceil(n * 0.7))) return null;
  return score - Math.min(pos[0], 30) * 0.2;
}

/**
 * @param {string} needle lowercased, no whitespace
 * @param {string} text original text
 * @param {string} [lower] text.toLowerCase(), passed in when cached
 * @returns {{score: number, positions: number[]} | null}
 */
export function fuzzyMatch(needle, text, lower = text.toLowerCase()) {
  const n = needle.length;
  if (n === 0) return { score: 0, positions: [] };
  if (n > lower.length) return null;

  let at = lower.indexOf(needle);
  if (at !== -1) {
    let best = at;
    let onBoundary = isBoundary(text, at);
    for (let tries = 0; !onBoundary && tries < 8; tries++) {
      at = lower.indexOf(needle, at + 1);
      if (at === -1) break;
      if (isBoundary(text, at)) {
        best = at;
        onBoundary = true;
      }
    }
    let score = 40 + n * 12 - Math.min(best, 40) * 0.25;
    if (onBoundary) score += 24;
    if (best === 0) score += 12;
    if (n === lower.length) score += 20;
    const positions = new Array(n);
    for (let i = 0; i < n; i++) positions[i] = best + i;
    return { score, positions };
  }
  if (n < 2) return null;

  let best = null;
  for (const pos of [tightAlignment(needle, lower), boundaryAlignment(needle, text, lower)]) {
    if (!pos) continue;
    const score = scoreAlignment(text, pos);
    if (score !== null && (!best || score > best.score)) best = { score, positions: pos };
  }
  return best;
}
