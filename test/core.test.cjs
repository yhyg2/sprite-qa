const assert = require("node:assert/strict");
const test = require("node:test");
const { imageHeader, alphaStatus, validRegion, comparePixels, assessment } = require("../src/core.js");

function png(width, height, { animated = false } = {}) {
  // Header fixture for the preflight parser. Compressed image data is decoded by the browser.
  const bytes = new Uint8Array(animated ? 65 : 45);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(Buffer.from("IHDR"), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  let end = 33;
  if (animated) {
    view.setUint32(end, 8);
    bytes.set(Buffer.from("acTL"), end + 4);
    end += 20;
  }
  bytes.set(Buffer.from("IDAT"), end + 4);
  return bytes.buffer;
}

function webp({ animated = false, lossy = false } = {}) {
  const length = animated ? 10 : lossy ? 10 : 5;
  const bytes = new Uint8Array(20 + length + (length % 2));
  const view = new DataView(bytes.buffer);
  bytes.set(Buffer.from("RIFF"), 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(Buffer.from("WEBP"), 8);
  bytes.set(Buffer.from(animated ? "VP8X" : lossy ? "VP8 " : "VP8L"), 12);
  view.setUint32(16, length, true);
  if (animated) {
    bytes[20] = 2;
  } else if (lossy) {
    bytes.set([0x9d, 0x01, 0x2a], 23);
    view.setUint16(26, 27, true);
    view.setUint16(28, 13, true);
  } else {
    bytes[20] = 0x2f;
    view.setUint32(21, 26 | (12 << 14), true);
  }
  return bytes.buffer;
}

test("PNG preflight reads dimensions and accepts upper-case extensions", () => {
  assert.deepEqual(imageHeader(png(2560, 1440), "角色.PNG"), { format: "png", width: 2560, height: 1440 });
});

test("WebP preflight reads lossy and lossless canvas sizes", () => {
  const expected = { format: "webp", width: 27, height: 13 };
  assert.deepEqual(imageHeader(webp(), "立绘.webp"), expected);
  assert.deepEqual(imageHeader(webp({ lossy: true }), "立绘.webp"), expected);
});

test("preflight detects both animated formats", () => {
  assert.throws(() => imageHeader(png(9, 9, { animated: true }), "a.png"), { code: "animated" });
  assert.throws(() => imageHeader(webp({ animated: true }), "a.webp"), { code: "animated" });
});

test("preflight rejects renamed, truncated, empty and oversized images", () => {
  assert.throws(() => imageHeader(png(9, 9), "renamed.webp"), { code: "extension-mismatch" });
  assert.throws(() => imageHeader(new ArrayBuffer(0), "empty.png"), { code: "unsupported-format" });
  assert.throws(() => imageHeader(png(9, 9).slice(0, 29), "truncated.png"), { code: "invalid-header" });
  assert.throws(() => imageHeader(png(0, 9), "zero.png"), { code: "invalid-header" });
  assert.throws(() => imageHeader(png(16_000, 9), "wide.png"), { code: "canvas-too-large" });
  assert.throws(() => imageHeader(png(5000, 5000), "large.png"), { code: "canvas-too-large" });
});

test("alpha scan identifies opaque images, empty images, and any useful transparency", () => {
  assert.equal(alphaStatus(Uint8Array.of(200, 100, 70, 0)), "empty-image");
  assert.equal(alphaStatus(Uint8Array.of(200, 100, 70, 255)), "opaque");
  assert.equal(alphaStatus(Uint8Array.of(200, 100, 70, 128)), "ok");
  assert.equal(alphaStatus(Uint8Array.of(0, 0, 0, 0, 200, 100, 70, 255)), "ok");
});

test("comparison uses union of visible pixels and hides RGB of fully transparent pixels", () => {
  const base = Uint8Array.of(20, 40, 10, 255, 10, 20, 0, 0, 0, 0, 0, 0);
  const target = Uint8Array.of(38, 40, 10, 255, 0, 200, 100, 0, 12, 0, 0, 255);
  const result = comparePixels(base, target, 3, 1, { x: 0, y: 0, width: 1, height: 1 }, 12, true);
  assert.deepEqual(result.inside, { changed: 1, compared: 1 });
  assert.deepEqual(result.outside, { changed: 1, compared: 1 });
  assert.deepEqual([...result.mask], [1, 0, 2]);
});

test("change tests use premultiplied color and include alpha differences", () => {
  const base = Uint8Array.of(0, 0, 0, 12, 10, 20, 30, 255, 0, 0, 0, 0);
  const target = Uint8Array.of(255, 0, 0, 12, 22, 20, 30, 255, 0, 0, 0, 13);
  const result = comparePixels(base, target, 3, 1, null, 12, true);
  assert.deepEqual(result.outside, { changed: 1, compared: 3 });
  assert.deepEqual([...result.mask], [0, 0, 2]);
});

test("rectangle coordinates use exclusive right and bottom edges", () => {
  const base = new Uint8Array(16).fill(255);
  const target = new Uint8Array(16);
  const region = { x: 0, y: 0, width: 1, height: 1 };
  const result = comparePixels(base, target, 2, 2, region, 0, true);
  assert.deepEqual([...result.mask], [1, 2, 2, 2]);
  assert.equal(validRegion({ ...region, x: 1 }, 2, 2), true);
  assert.equal(validRegion({ ...region, x: 2 }, 2, 2), false);
  assert.equal(validRegion({ ...region, x: 0.5 }, 2, 2), false);
  assert.throws(() => comparePixels(base, target, 2, 2, { ...region, height: 0 }, 0), RangeError);
});

test("exact limits pass, exceedance or an untestable area needs review", () => {
  assert.deepEqual(assessment({ changed: 1, compared: 400 }, 25), { status: "pass", issue: null });
  assert.deepEqual(assessment({ changed: 1, compared: 399 }, 25), { status: "review", issue: "outside-changes" });
  assert.deepEqual(assessment({ changed: 0, compared: 0 }, 25), { status: "review", issue: "no-outside-pixels" });
});
