import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../extension/shapes.js';

const { classify } = globalThis.annotShapes;
// A real three-stroke arrow pointing up-right at a button: shaft first, then two head strokes.
const arrow = JSON.parse(fs.readFileSync(new URL('./fixtures/arrow.json', import.meta.url)));

const assertTip = (r) => {
  assert.equal(r.shape, 'arrow');
  assert.ok(Math.hypot(r.tip[0] - 1126, r.tip[1] - 71) < 4, `tip ${r.tip}`);
  assert.ok(r.dir[0] > 0.3 && r.dir[1] < -0.5, `dir ${r.dir}`);
};

test('three-stroke arrow: tip is the shaft end nearest the two short strokes', () => {
  assertTip(classify(arrow));
});

test('arrow tip does not depend on stroke order or shaft direction', () => {
  assertTip(classify([arrow[2], arrow[0], arrow[1]]));
  assertTip(classify([[...arrow[0]].reverse(), arrow[1], arrow[2]]));
});

test('closed loop is a circle', () => {
  const loop = Array.from({ length: 40 }, (_, i) => [200 + 80 * Math.cos(i / 6.3), 200 + 40 * Math.sin(i / 6.3)]);
  assert.equal(classify([loop]).shape, 'circle');
});

test('a loop around a wide heading is a circle, not an underline', () => {
  assert.equal(classify([[[0, 0], [300, -2], [310, 48], [-2, 50], [2, 6]]]).shape, 'circle');
});

test('flat wide stroke is an underline', () => {
  assert.equal(classify([[[10, 100], [60, 103], [120, 99], [180, 104]]]).shape, 'underline');
});

test('single diagonal stroke is an arrow toward its far end', () => {
  const r = classify([[[0, 200], [50, 150], [100, 100]]]);
  assert.equal(r.shape, 'arrow');
  assert.deepEqual(r.tip, [100, 100]);
});

test('two equal strokes (an X) are just a drawing', () => {
  assert.equal(classify([[[0, 0], [100, 100]], [[100, 0], [0, 100]]]).shape, 'drawing');
});
