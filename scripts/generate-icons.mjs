// Generates the PWA icon set as flat PNGs — a teal rounded square with a white
// medical cross. Written by hand (zlib + PNG chunks) so the build has no
// native image dependency. Run: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const TEAL = [13, 148, 136]
const WHITE = [255, 255, 255]

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** @param pixels {(x: number, y: number) => [number, number, number]} */
function writePng(path, size, pixels) {
  // Raw scanlines, each prefixed with filter type 0 (None).
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixels(x, y)
      raw[o++] = r
      raw[o++] = g
      raw[o++] = b
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  // bytes 10-12 stay 0: deflate, adaptive filtering, no interlace

  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

/**
 * @param size     icon edge length in px
 * @param radius   corner radius as a fraction of the edge; 0 = square
 * @param crossOf  cross length as a fraction of the edge. Maskable icons get
 *                 cropped to the platform's shape, so their artwork has to stay
 *                 inside the ~80% safe zone.
 */
function icon(size, { radius = 0.22, crossOf = 0.62 } = {}) {
  const r = size * radius
  const armLong = size * crossOf
  const armShort = size * crossOf * 0.32
  const c = size / 2

  return (x, y) => {
    const px = x + 0.5
    const py = y + 0.5

    // Outside the rounded corners -> white page background.
    const dx = Math.max(r - px, px - (size - r), 0)
    const dy = Math.max(r - py, py - (size - r), 0)
    if (dx * dx + dy * dy > r * r) return WHITE

    // The cross: union of a tall bar and a wide bar, both centred.
    const ax = Math.abs(px - c)
    const ay = Math.abs(py - c)
    const vertical = ax <= armShort / 2 && ay <= armLong / 2
    const horizontal = ax <= armLong / 2 && ay <= armShort / 2
    return vertical || horizontal ? WHITE : TEAL
  }
}

mkdirSync(PUBLIC_DIR, { recursive: true })

const outputs = [
  ['pwa-192x192.png', 192, {}],
  ['pwa-512x512.png', 512, {}],
  // iOS already applies its own corner mask to the home-screen icon.
  ['apple-touch-icon.png', 180, { radius: 0 }],
  // Teal bleeds to every edge, cross shrunk into the safe zone.
  ['pwa-maskable-512x512.png', 512, { radius: 0, crossOf: 0.45 }],
]

for (const [name, size, opts] of outputs) {
  writePng(join(PUBLIC_DIR, name), size, icon(size, opts))
  console.log(`wrote public/${name} (${size}x${size})`)
}
