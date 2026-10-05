import test from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyMatch } from '../src/fuzzy.js';

const score = (needle, text) => fuzzyMatch(needle, text)?.score ?? null;

test('substring matches report contiguous positions', () => {
  assert.deepEqual(fuzzyMatch('hub', 'GitHub').positions, [3, 4, 5]);
});

test('a prefix beats a word start, which beats mid-word', () => {
  assert.ok(score('git', 'GitHub') > score('git', 'My git notes'));
  assert.ok(score('git', 'My git notes') > score('git', 'Digital'));
});

test('prefers the occurrence on a word boundary', () => {
  assert.deepEqual(fuzzyMatch('pull', 'spullx pull request').positions, [7, 8, 9, 10]);
});

test('matches initials across words', () => {
  assert.deepEqual(fuzzyMatch('gpr', 'GitHub Pull Requests').positions, [0, 7, 12]);
  assert.ok(fuzzyMatch('yt', 'YouTube'));
  assert.ok(fuzzyMatch('gcal', 'Google Calendar'));
});

test('longer queries tolerate a skipped letter', () => {
  assert.ok(fuzzyMatch('gmal', 'Gmail'));
  assert.ok(fuzzyMatch('kuberntes', 'Kubernetes - Pod lifecycle'));
});

test('short queries need every letter anchored', () => {
  assert.equal(fuzzyMatch('git', 'a field guide to release trains'), null);
  assert.equal(fuzzyMatch('git', 'docs.google.com/document/d/1x9aQ/edit'), null);
});

test('a substring beats a scattered subsequence', () => {
  assert.ok(score('doc', 'Docs home') > score('doc', 'Dashboard overview charts'));
});

test('rejects scattered letters with nothing anchoring them', () => {
  assert.equal(fuzzyMatch('xqz', 'example quiz'), null);
  assert.equal(fuzzyMatch('gh', 'dog harness'), null);
});

test('rejects when letters are missing or out of order', () => {
  assert.equal(fuzzyMatch('abc', 'cab'), null);
  assert.equal(fuzzyMatch('longer', 'long'), null);
});

test('empty needle matches everything', () => {
  assert.deepEqual(fuzzyMatch('', 'anything'), { score: 0, positions: [] });
});
