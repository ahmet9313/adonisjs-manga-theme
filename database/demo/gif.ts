/**
 * Dependency-free animated GIF support for the demo data: an LZW encoder, a tiny anti-aliased
 * software canvas (supersampled), a 5x7 bitmap font (Turkish letters included) and a fixed
 * 256-colour palette. Used to draw the reaction GIFs that demo users post in comments.
 */

export type RGB = [number, number, number]

export const hex = (value: string): RGB => {
  const text = value.replace('#', '')
  return [
    Number.parseInt(text.slice(0, 2), 16),
    Number.parseInt(text.slice(2, 4), 16),
    Number.parseInt(text.slice(4, 6), 16),
  ]
}

export const mix = (a: RGB, b: RGB, amount: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * amount),
  Math.round(a[1] + (b[1] - a[1]) * amount),
  Math.round(a[2] + (b[2] - a[2]) * amount),
]

/* ---- Palette: 6x6x6 colour cube followed by 40 greys ------------------------------------- */

const levels = [0, 51, 102, 153, 204, 255]

export const palette: Uint8Array = (() => {
  const data = new Uint8Array(256 * 3)
  let index = 0
  for (const r of levels)
    for (const g of levels)
      for (const b of levels) {
        data[index * 3] = r
        data[index * 3 + 1] = g
        data[index * 3 + 2] = b
        index++
      }
  for (let step = 0; step < 40; step++) {
    const value = Math.round(((step + 0.5) / 40) * 255)
    data[(216 + step) * 3] = value
    data[(216 + step) * 3 + 1] = value
    data[(216 + step) * 3 + 2] = value
  }
  return data
})()

const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Maps RGB pixels to palette indices with light ordered dithering (stable between frames). */
export function quantize(rgb: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (bayer[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * 40
      const at = (y * width + x) * 3
      const r = Math.max(0, Math.min(255, rgb[at] + offset))
      const g = Math.max(0, Math.min(255, rgb[at + 1] + offset))
      const b = Math.max(0, Math.min(255, rgb[at + 2] + offset))
      const cr = Math.round(r / 51)
      const cg = Math.round(g / 51)
      const cb = Math.round(b / 51)
      const cubeError = (cr * 51 - r) ** 2 + (cg * 51 - g) ** 2 + (cb * 51 - b) ** 2
      const grey = (r + g + b) / 3
      const greyStep = Math.max(0, Math.min(39, Math.round((grey / 255) * 40 - 0.5)))
      const greyValue = ((greyStep + 0.5) / 40) * 255
      const greyError = (greyValue - r) ** 2 + (greyValue - g) ** 2 + (greyValue - b) ** 2
      out[y * width + x] = greyError < cubeError ? 216 + greyStep : cr * 36 + cg * 6 + cb
    }
  }
  return out
}

/* ---- Encoder ----------------------------------------------------------------------------- */

function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize
  const endCode = clearCode + 1
  const bytes: number[] = []
  let codeSize = minCodeSize + 1
  let nextCode = endCode + 1
  let table = new Map<number, number>()
  let buffer = 0
  let bits = 0

  const emit = (code: number) => {
    buffer |= code << bits
    bits += codeSize
    while (bits >= 8) {
      bytes.push(buffer & 0xff)
      buffer >>>= 8
      bits -= 8
    }
  }

  emit(clearCode)
  let prefix = indices[0]
  for (let index = 1; index < indices.length; index++) {
    const value = indices[index]
    const key = (prefix << 8) | value
    const found = table.get(key)
    if (found !== undefined) {
      prefix = found
      continue
    }
    emit(prefix)
    if (nextCode === 4096) {
      emit(clearCode)
      table = new Map()
      nextCode = endCode + 1
      codeSize = minCodeSize + 1
    } else {
      if (nextCode >= 1 << codeSize) codeSize++
      table.set(key, nextCode++)
    }
    prefix = value
  }
  emit(prefix)
  emit(endCode)
  if (bits > 0) bytes.push(buffer & 0xff)
  return bytes
}

export interface GifFrame {
  /** Palette indices, row-major. */
  indices: Uint8Array
  /** Hundredths of a second. */
  delay: number
}

export function encodeGif(width: number, height: number, frames: GifFrame[]): Buffer {
  const out: number[] = []
  const word = (value: number) => out.push(value & 0xff, (value >> 8) & 0xff)
  out.push(...Buffer.from('GIF89a'))
  word(width)
  word(height)
  out.push(0xf7, 0, 0) // global table, 256 colours, background 0
  for (const byte of palette) out.push(byte)
  // Loop forever.
  out.push(0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0'), 0x03, 0x01, 0, 0, 0)
  for (const frame of frames) {
    out.push(0x21, 0xf9, 0x04, 0x04, frame.delay & 0xff, (frame.delay >> 8) & 0xff, 0, 0)
    out.push(0x2c)
    word(0)
    word(0)
    word(width)
    word(height)
    out.push(0)
    out.push(8)
    const data = lzwEncode(frame.indices, 8)
    for (let offset = 0; offset < data.length; offset += 255) {
      const chunk = data.slice(offset, offset + 255)
      out.push(chunk.length, ...chunk)
    }
    out.push(0)
  }
  out.push(0x3b)
  return Buffer.from(out)
}

/* ---- Canvas ------------------------------------------------------------------------------ */

/** RGB canvas drawn at `scale`x resolution and box-filtered down, which anti-aliases edges. */
export class Canvas {
  private readonly hw: number
  private readonly hh: number
  private readonly px: Uint8Array

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly scale = 3
  ) {
    this.hw = width * scale
    this.hh = height * scale
    this.px = new Uint8Array(this.hw * this.hh * 3)
  }

  private put(x: number, y: number, color: RGB) {
    const at = (y * this.hw + x) * 3
    this.px[at] = color[0]
    this.px[at + 1] = color[1]
    this.px[at + 2] = color[2]
  }

  /** Visits every hi-res pixel inside the box (in canvas units) for which `inside` is true. */
  private scan(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: RGB,
    inside: (x: number, y: number) => boolean
  ) {
    const s = this.scale
    const left = Math.max(0, Math.floor(x0 * s))
    const right = Math.min(this.hw - 1, Math.ceil(x1 * s))
    const top = Math.max(0, Math.floor(y0 * s))
    const bottom = Math.min(this.hh - 1, Math.ceil(y1 * s))
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++)
        if (inside((x + 0.5) / s, (y + 0.5) / s)) this.put(x, y, color)
  }

  clear(color: RGB) {
    for (let at = 0; at < this.px.length; at += 3) {
      this.px[at] = color[0]
      this.px[at + 1] = color[1]
      this.px[at + 2] = color[2]
    }
  }

  /** Linear gradient from `from` to `to`; `angle` in degrees (0 = left→right, 90 = top→bottom). */
  gradient(from: RGB, to: RGB, angle = 90) {
    const radians = (angle * Math.PI) / 180
    const dx = Math.cos(radians)
    const dy = Math.sin(radians)
    const length = Math.abs(this.width * dx) + Math.abs(this.height * dy) || 1
    for (let y = 0; y < this.hh; y++)
      for (let x = 0; x < this.hw; x++) {
        const cx = (x + 0.5) / this.scale - this.width / 2
        const cy = (y + 0.5) / this.scale - this.height / 2
        const amount = Math.max(0, Math.min(1, 0.5 + (cx * dx + cy * dy) / length))
        this.put(x, y, mix(from, to, amount))
      }
  }

  rect(x: number, y: number, w: number, h: number, color: RGB) {
    this.scan(x, y, x + w, y + h, color, () => true)
  }

  roundRect(x: number, y: number, w: number, h: number, r: number, color: RGB) {
    const radius = Math.min(r, w / 2, h / 2)
    this.scan(x, y, x + w, y + h, color, (px, py) => {
      const dx = Math.max(x + radius - px, 0, px - (x + w - radius))
      const dy = Math.max(y + radius - py, 0, py - (y + h - radius))
      return dx * dx + dy * dy <= radius * radius
    })
  }

  circle(cx: number, cy: number, r: number, color: RGB) {
    this.scan(
      cx - r,
      cy - r,
      cx + r,
      cy + r,
      color,
      (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r
    )
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: RGB, rotation = 0) {
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const reach = Math.max(rx, ry)
    this.scan(cx - reach, cy - reach, cx + reach, cy + reach, color, (px, py) => {
      const x = (px - cx) * cos + (py - cy) * sin
      const y = -(px - cx) * sin + (py - cy) * cos
      return (x / rx) ** 2 + (y / ry) ** 2 <= 1
    })
  }

  polygon(points: [number, number][], color: RGB) {
    const xs = points.map((p) => p[0])
    const ys = points.map((p) => p[1])
    this.scan(
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
      color,
      (px, py) => {
        let inside = false
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [xi, yi] = points[i]
          const [xj, yj] = points[j]
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
        }
        return inside
      }
    )
  }

  /** Thick line with round caps. */
  line(x1: number, y1: number, x2: number, y2: number, width: number, color: RGB) {
    const half = width / 2
    const vx = x2 - x1
    const vy = y2 - y1
    const lengthSquared = vx * vx + vy * vy || 1
    this.scan(
      Math.min(x1, x2) - half,
      Math.min(y1, y2) - half,
      Math.max(x1, x2) + half,
      Math.max(y1, y2) + half,
      color,
      (px, py) => {
        const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / lengthSquared))
        return (px - (x1 + t * vx)) ** 2 + (py - (y1 + t * vy)) ** 2 <= half * half
      }
    )
  }

  /** Ring segment; angles in radians, 0 = right, increasing clockwise. */
  ring(
    cx: number,
    cy: number,
    r: number,
    thickness: number,
    color: RGB,
    from = 0,
    to = Math.PI * 2
  ) {
    const outer = r + thickness / 2
    const inner = Math.max(0, r - thickness / 2)
    const full = to - from >= Math.PI * 2 - 1e-6
    this.scan(cx - outer, cy - outer, cx + outer, cy + outer, color, (px, py) => {
      const distance = (px - cx) ** 2 + (py - cy) ** 2
      if (distance > outer * outer || distance < inner * inner) return false
      if (full) return true
      let angle = Math.atan2(py - cy, px - cx) - from
      angle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      return angle <= to - from
    })
  }

  /** Draws text with the 5x7 font; returns the rendered width in canvas units. */
  text(
    value: string,
    x: number,
    y: number,
    size: number,
    color: RGB,
    align: 'left' | 'center' = 'left'
  ) {
    const width = textWidth(value, size)
    let cursor = align === 'center' ? x - width / 2 : x
    for (const char of value.toLocaleUpperCase('tr-TR')) {
      const glyph = glyphFor(char)
      for (const mark of glyph.marks)
        this.rect(cursor + mark[0] * size, y + mark[1] * size, size, size, color)
      glyph.rows.forEach((row, rowIndex) => {
        for (let column = 0; column < 5; column++)
          if (row[column] === '#')
            this.rect(cursor + column * size, y + rowIndex * size, size, size, color)
      })
      cursor += 6 * size
    }
    return width
  }

  /** Box-filters the hi-res buffer down to the final RGB frame. */
  render(): Uint8Array {
    const s = this.scale
    const out = new Uint8Array(this.width * this.height * 3)
    const area = s * s
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        let r = 0
        let g = 0
        let b = 0
        for (let sy = 0; sy < s; sy++)
          for (let sx = 0; sx < s; sx++) {
            const at = ((y * s + sy) * this.hw + (x * s + sx)) * 3
            r += this.px[at]
            g += this.px[at + 1]
            b += this.px[at + 2]
          }
        const to = (y * this.width + x) * 3
        out[to] = Math.round(r / area)
        out[to + 1] = Math.round(g / area)
        out[to + 2] = Math.round(b / area)
      }
    return out
  }
}

/* ---- 5x7 bitmap font --------------------------------------------------------------------- */

const font: Record<string, string[]> = {
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
  ',': ['.....', '.....', '.....', '.....', '..#..', '..#..', '.#...'],
  ':': ['.....', '..#..', '.....', '.....', '..#..', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '♥': ['.#.#.', '#####', '#####', '#####', '.###.', '..#..', '.....'],
  '…': ['.....', '.....', '.....', '.....', '.....', '.....', '#.#.#'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
}

/** Extra pixels (column, row) above/below the 7 rows for Turkish letters. */
const marks: Record<string, [number, number][]> = {
  Ç: [
    [2, 7],
    [1, 8],
  ],
  Ş: [
    [2, 7],
    [1, 8],
  ],
  Ğ: [
    [1, -1],
    [2, -2],
    [3, -1],
  ],
  İ: [[2, -2]],
  Ö: [
    [1, -2],
    [3, -2],
  ],
  Ü: [
    [1, -2],
    [3, -2],
  ],
}
const base: Record<string, string> = { Ç: 'C', Ş: 'S', Ğ: 'G', İ: 'I', Ö: 'O', Ü: 'U' }

function glyphFor(char: string) {
  const source = base[char] ?? char
  return { rows: font[source] ?? font['?'], marks: marks[char] ?? [] }
}

export function textWidth(value: string, size: number) {
  return Math.max(0, [...value].length * 6 - 1) * size
}

/** Largest integer size (1–3) at which `value` fits in `maxWidth`. */
export function fitText(value: string, maxWidth: number) {
  for (const size of [3, 2, 1]) if (textWidth(value, size) <= maxWidth) return size
  return 1
}

/* ---- Animation helper -------------------------------------------------------------------- */

export interface AnimationSpec {
  slug: string
  title: string
  width: number
  height: number
  frames: number
  /** Hundredths of a second per frame. */
  delay: number
  draw: (canvas: Canvas, t: number) => void
}

export function renderAnimation(spec: AnimationSpec): Buffer {
  const frames: GifFrame[] = []
  for (let frame = 0; frame < spec.frames; frame++) {
    const canvas = new Canvas(spec.width, spec.height)
    spec.draw(canvas, frame / spec.frames)
    frames.push({ indices: quantize(canvas.render(), spec.width, spec.height), delay: spec.delay })
  }
  return encodeGif(spec.width, spec.height, frames)
}
