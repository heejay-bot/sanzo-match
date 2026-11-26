// Run: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { suggest, suggestRoleRatios, suggestIttenRatios, mergeSimilar, contrast } from '../ratio.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('spec example: 3 colours, ui profile', () => {
  const r = suggest(['#40456A', '#F6F7FB', '#F99D1B']);
  assert.deepEqual(r.role_ratios, [30, 60, 10]);
  assert.deepEqual(r.itten_ratios, [40.8, 54.2, 5.0]);
});

test('spec example: 2 colours', () => {
  assert.deepEqual(suggest(['#40456A', '#F99D1B']).role_ratios, [70, 30]);
});

test('sums are 100 (±0.1) for all profiles and sizes', () => {
  const sets = [['#cb2f43', '#437742'], ['#f8ed43', '#4f4086', '#f9c1ce'], ['#007190', '#f37420', '#ffffff', '#222222']];
  for (const p of ['ui', 'fashion_6030', 'fashion_7025']) for (const s of sets) {
    const r = suggest(s, p);
    near(sum(r.role_ratios), 100, 0.1);
    near(sum(r.itten_ratios), 100, 0.1);
  }
});

test('order independence', () => {
  const a = ['#40456A', '#F6F7FB', '#F99D1B', '#437742'];
  const b = [a[2], a[0], a[3], a[1]];
  const ra = suggest(a), rb = suggest(b);
  for (const h of ra.colors) {
    assert.equal(ra.role_ratios[ra.colors.indexOf(h)], rb.role_ratios[rb.colors.indexOf(h)]);
    near(ra.itten_ratios[ra.colors.indexOf(h)], rb.itten_ratios[rb.colors.indexOf(h)], 0.1);
  }
});

test('#1F2240 and #202342 merge', () => {
  assert.equal(mergeSimilar(['#1F2240', '#202342']).length, 1);
});

test('1 or 5+ colours throw', () => {
  assert.throws(() => suggestRoleRatios(['#000000']), RangeError);
  assert.throws(() => suggestRoleRatios(['#100000', '#002000', '#000030', '#404000', '#005050']), RangeError);
  assert.throws(() => suggestIttenRatios(['#000000']), RangeError);
});

test('Itten regression: yellow:violet ~30:70, red:green ~50:50', () => {
  const yv = suggestIttenRatios(['#FFFF00', '#8000FF']);
  near(yv[0], 30, 8); near(yv[1], 70, 8);
  const rg = suggestIttenRatios(['#FF0000', '#00A000']);
  near(rg[0], 50, 10); near(rg[1], 50, 10);
});

test('contrast matches the colour-system doc', () => {
  near(contrast('#1F2240', '#F6F7FB'), 14.41, 0.01);
  near(contrast('#F99D1B', '#F6F7FB'), 1.99, 0.01);
});
