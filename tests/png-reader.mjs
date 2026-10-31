import { inflateSync } from 'node:zlib';

// Minimal reader for the non-interlaced RGB/RGBA PNG screenshots Chromium emits.
// Used to test visible refraction without adding an image library to the extension.
export function readPNG(buffer) {
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Not a PNG');
  let width, height, channels;
  const chunks = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const kind = buffer.toString('ascii', offset + 4, offset + 8);
    const bytes = buffer.subarray(offset + 8, offset + 8 + length);
    if (kind === 'IHDR') {
      width = bytes.readUInt32BE(0);
      height = bytes.readUInt32BE(4);
      if (bytes[8] !== 8 || ![2, 6].includes(bytes[9]) || bytes[12] !== 0) throw new Error('Unsupported screenshot PNG format');
      channels = bytes[9] === 2 ? 3 : 4;
    }
    if (kind === 'IDAT') chunks.push(bytes);
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  if (raw.length !== (stride + 1) * height) throw new Error('Unexpected PNG data length');
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    if (filter > 4) throw new Error('Unsupported PNG row filter');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const left = x < channels ? 0 : data[i - channels];
      const up = y === 0 ? 0 : data[i - stride];
      const corner = y === 0 || x < channels ? 0 : data[i - stride - channels];
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - corner;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner);
        predictor = a <= b && a <= c ? left : b <= c ? up : corner;
      }
      data[i] = (raw[start + 1 + x] + predictor) & 255;
    }
  }
  return { width, height, channels, data };
}

export function red(image, x, y) {
  return image.data[(y * image.width + x) * image.channels];
}

export function equalRegion(a, b, region) {
  if (a.channels !== b.channels || a.width !== b.width || a.height !== b.height) return false;
  for (let y = Math.ceil(region.y); y < Math.floor(region.y + region.height); y++) {
    const start = (y * a.width + Math.ceil(region.x)) * a.channels;
    const end = (y * a.width + Math.floor(region.x + region.width)) * a.channels;
    if (!a.data.subarray(start, end).equals(b.data.subarray(start, end))) return false;
  }
  return true;
}
