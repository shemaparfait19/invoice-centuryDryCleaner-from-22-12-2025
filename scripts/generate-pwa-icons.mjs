// Generates the PWA icons (PNG) without any image dependency.
// Run: node scripts/generate-pwa-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Brand blue rounded-square background with a white "C".
function draw(size, { inset = 0.06, ring = 0.3, gap = 0.42 } = {}) {
  const SS = 3; // supersampling for smooth edges
  return (px, py) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    const samples = SS * SS;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / size;
        const y = (py + (sy + 0.5) / SS) / size;
        const cx = x - 0.5;
        const cy = y - 0.5;

        // Rounded square mask
        const radius = 0.22;
        const qx = Math.max(Math.abs(cx) - (0.5 - inset - radius), 0);
        const qy = Math.max(Math.abs(cy) - (0.5 - inset - radius), 0);
        const inside = Math.hypot(qx, qy) <= radius;

        // Brand gradient
        const t = (x + y) / 2;
        let sr = Math.round(37 + (17 - 37) * t);
        let sg = Math.round(99 + (48 - 99) * t);
        let sb = Math.round(235 + (132 - 235) * t);

        // White C ring
        const dist = Math.hypot(cx, cy);
        const inner = ring;
        const outer = ring + 0.075;
        const angle = Math.atan2(cy, cx); // 0 = right
        const inGap = Math.abs(angle) < gap;
        if (dist >= inner && dist <= outer && !inGap) {
          sr = 255;
          sg = 255;
          sb = 255;
        }

        if (inside) {
          r += sr;
          g += sg;
          b += sb;
          a += 255;
        }
      }
    }
    return [Math.round(r / samples), Math.round(g / samples), Math.round(b / samples), Math.round(a / samples)];
  };
}

const targets = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["maskable-512.png", 512, { ring: 0.24 }],
  ["apple-touch-icon.png", 180, { inset: 0 }],
];

for (const [name, size, opts] of targets) {
  writeFileSync(join(outDir, name), png(size, draw(size, opts)));
  console.log("wrote", join("public/icons", name));
}
