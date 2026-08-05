'use strict';

const assert = require('node:assert/strict');
const {computePlacement, normalizeRotation} = require('../assets/pfsp-watermark-placement-fix.js');

function mapPdfPointToDisplay(point, crop, rotation) {
  const x = point.x - crop.x;
  const y = point.y - crop.y;
  if (rotation === 90) return {x: y, y: x};
  if (rotation === 180) return {x: crop.width - x, y};
  if (rotation === 270) return {x: crop.height - y, y: crop.width - x};
  return {x, y: crop.height - y};
}

function imageCorners(placement) {
  const angle = placement.rotate * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const xAxis = {x: placement.width * cos, y: placement.width * sin};
  const yAxis = {x: -placement.height * sin, y: placement.height * cos};
  const bl = {x: placement.x, y: placement.y};
  return [
    bl,
    {x: bl.x + xAxis.x, y: bl.y + xAxis.y},
    {x: bl.x + yAxis.x, y: bl.y + yAxis.y},
    {x: bl.x + xAxis.x + yAxis.x, y: bl.y + xAxis.y + yAxis.y}
  ];
}

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} !== ${expected}`);
}

const crop = {x: 10, y: 20, width: 600, height: 800};
for (const rotation of [0, 90, 180, 270]) {
  const placement = computePlacement({
    cropBox: crop,
    rotation,
    cxPct: 0.57,
    cyPct: 0.42,
    widthPct: 0.25,
    aspectRatio: 0.5
  });
  const points = imageCorners(placement).map(point => mapPdfPointToDisplay(point, crop, rotation));
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  close(Math.min(...xs), placement.left, `left at ${rotation}`);
  close(Math.min(...ys), placement.top, `top at ${rotation}`);
  close(Math.max(...xs) - Math.min(...xs), placement.width, `width at ${rotation}`);
  close(Math.max(...ys) - Math.min(...ys), placement.height, `height at ${rotation}`);
}

assert.equal(normalizeRotation(-90), 270);
assert.equal(normalizeRotation(450), 90);
assert.equal(normalizeRotation(44), 0);
assert.equal(normalizeRotation(46), 90);

const clamped = computePlacement({
  cropBox: {x: 0, y: 0, width: 100, height: 200},
  rotation: 0,
  cxPct: 0.5,
  cyPct: 0.5,
  widthPct: 99,
  aspectRatio: 1
});
assert.equal(clamped.width, 140);

assert.throws(() => computePlacement({cropBox: {width: 0, height: 10}}), /Invalid PDF page box/);
console.log('watermark placement tests passed');
