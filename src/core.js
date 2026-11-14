"use strict";

const SpriteQA = (() => {
  const MAX_PIXELS = 16_777_216;
  const MAX_SIDE = 8_192;
  const MAX_BYTES = 64 * 1024 * 1024;
  const DEFAULT_SETTINGS = Object.freeze({ delta: 12, outsideLimit: 25 });
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

  function formatError(code) {
    throw Object.assign(new Error(code), { code });
  }

  function fourCC(bytes, offset) {
    return String.fromCharCode(...bytes.subarray(offset, offset + 4));
  }

  function pngSize(bytes, view) {
    if (bytes.length < 33 || view.getUint32(8) !== 13 || fourCC(bytes, 12) !== "IHDR") {
      formatError("invalid-header");
    }
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      if (length > bytes.length - offset - 12) formatError("invalid-header");
      const type = fourCC(bytes, offset + 4);
      if (type === "acTL") formatError("animated");
      if (type === "IDAT") {
        return { width: view.getUint32(16), height: view.getUint32(20) };
      }
      if (type === "IEND") break;
      offset += length + 12;
    }
    formatError("invalid-header");
  }

  function webpSize(bytes, view) {
    const end = view.getUint32(4, true) + 8;
    if (end > bytes.length || end < 20) formatError("invalid-header");
    let canvas = null;
    let frame = null;
    for (let offset = 12; offset + 8 <= end;) {
      const type = fourCC(bytes, offset);
      const length = view.getUint32(offset + 4, true);
      const start = offset + 8;
      if (length + (length % 2) > end - start) formatError("invalid-header");
      if (type === "ANIM" || type === "ANMF") formatError("animated");
      if (type === "VP8X") {
        if (length !== 10) formatError("invalid-header");
        if (bytes[start] & 0x02) formatError("animated");
        const read24 = (at) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
        canvas = { width: read24(start + 4) + 1, height: read24(start + 7) + 1 };
      }
      if (type === "VP8 ") {
        if (length < 10 || bytes[start + 3] !== 0x9d ||
            bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a) {
          formatError("invalid-header");
        }
        frame = {
          width: view.getUint16(start + 6, true) & 0x3fff,
          height: view.getUint16(start + 8, true) & 0x3fff,
        };
      }
      if (type === "VP8L") {
        if (length < 5 || bytes[start] !== 0x2f) formatError("invalid-header");
        const size = view.getUint32(start + 1, true);
        frame = { width: (size & 0x3fff) + 1, height: ((size >>> 14) & 0x3fff) + 1 };
      }
      offset = start + length + (length % 2);
    }
    if (!frame || (canvas && (canvas.width !== frame.width || canvas.height !== frame.height))) {
      formatError("invalid-header");
    }
    return canvas || frame;
  }

  function imageHeader(buffer, filename) {
    if (buffer.byteLength > MAX_BYTES) formatError("file-too-large");
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let format;
    let size;
    if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
      format = "png";
      size = pngSize(bytes, view);
    } else if (fourCC(bytes, 0) === "RIFF" && fourCC(bytes, 8) === "WEBP") {
      format = "webp";
      size = webpSize(bytes, view);
    } else {
      formatError("unsupported-format");
    }
    if (!filename.toLowerCase().endsWith("." + format)) formatError("extension-mismatch");
    if (!size.width || !size.height) formatError("invalid-header");
    if (size.width > MAX_SIDE || size.height > MAX_SIDE || size.width * size.height > MAX_PIXELS) {
      formatError("canvas-too-large");
    }
    return { format, ...size };
  }

  function alphaStatus(pixels) {
    let visible = false;
    let transparent = false;
    for (let i = 3; i < pixels.length; i += 4) {
      visible ||= pixels[i] > 0;
      transparent ||= pixels[i] < 255;
      if (visible && transparent) return "ok";
    }
    return visible ? "opaque" : "empty-image";
  }

  function validRegion(region, width, height) {
    if (region === null) return true;
    const { x, y, width: w, height: h } = region;
    return [x, y, w, h].every(Number.isInteger) && x >= 0 && y >= 0 && w > 0 && h > 0 &&
      x + w <= width && y + h <= height;
  }

  function comparePixels(base, candidate, width, height, region, delta, withMask = false) {
    if (base.length !== width * height * 4 || base.length !== candidate.length ||
        !validRegion(region, width, height) || !Number.isInteger(delta) || delta < 0 || delta > 255) {
      throw new RangeError("Incompatible pixel buffers or comparison settings");
    }
    const mask = withMask ? new Uint8Array(width * height) : null;
    const inside = { changed: 0, compared: 0 };
    const outside = { changed: 0, compared: 0 };
    const left = region?.x ?? 0;
    const right = left + (region?.width ?? 0);
    const top = region?.y ?? 0;
    const bottom = top + (region?.height ?? 0);
    const scaledDelta = delta * 255;
    for (let y = 0, i = 0; y < height; y++) {
      const inRegionRow = y >= top && y < bottom;
      for (let x = 0; x < width; x++, i += 4) {
        const a = base[i + 3];
        const b = candidate[i + 3];
        if (!(a | b)) continue;
        const inRegion = inRegionRow && x >= left && x < right;
        const counts = inRegion ? inside : outside;
        counts.compared++;
        const changed = Math.abs(a - b) > delta ||
          Math.abs(base[i] * a - candidate[i] * b) > scaledDelta ||
          Math.abs(base[i + 1] * a - candidate[i + 1] * b) > scaledDelta ||
          Math.abs(base[i + 2] * a - candidate[i + 2] * b) > scaledDelta;
        if (changed) {
          counts.changed++;
          if (mask) mask[i / 4] = inRegion ? 1 : 2;
        }
      }
    }
    return { inside, outside, mask };
  }

  function assessment(outside, outsideLimit) {
    if (outside.compared === 0) return { status: "review", issue: "no-outside-pixels" };
    if (outside.changed * 10_000 > outside.compared * outsideLimit) {
      return { status: "review", issue: "outside-changes" };
    }
    return { status: "pass", issue: null };
  }

  return { MAX_BYTES, DEFAULT_SETTINGS, imageHeader, alphaStatus, validRegion, comparePixels, assessment };
})();

if (typeof module !== "undefined") module.exports = SpriteQA;
