import { type Canvas, fitText, hex, mix, textWidth, type AnimationSpec, type RGB } from './gif.js'

/** Reaction GIFs that demo readers post in comments (and a few animated stickers). */

const SIZE = 160
const TAU = Math.PI * 2

const skin = hex('#ffd23f')
const skinDark = hex('#e8a317')
const ink = hex('#2a1b0b')
const white = hex('#ffffff')
const tear = hex('#4cc9f0')
const heartPink = hex('#ff4d8d')

type Mood = 'laugh' | 'cry' | 'shock' | 'sleep' | 'angry' | 'think' | 'love' | 'cool'

const wave = (t: number, speed = 1, phase = 0) => Math.sin((t * speed + phase) * TAU)
const bounce = (t: number, speed = 2) => Math.abs(wave(t, speed / 2))

function heart(c: Canvas, cx: number, cy: number, size: number, color: RGB) {
  c.circle(cx - size * 0.25, cy - size * 0.1, size * 0.29, color)
  c.circle(cx + size * 0.25, cy - size * 0.1, size * 0.29, color)
  c.polygon(
    [
      [cx - size * 0.52, cy - size * 0.02],
      [cx + size * 0.52, cy - size * 0.02],
      [cx, cy + size * 0.52],
    ],
    color
  )
}

function star(c: Canvas, cx: number, cy: number, outer: number, color: RGB, rotation = 0) {
  const points: [number, number][] = []
  for (let index = 0; index < 10; index++) {
    const radius = index % 2 === 0 ? outer : outer * 0.45
    const angle = (index / 10) * TAU - Math.PI / 2 + rotation
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius])
  }
  c.polygon(points, color)
}

function face(c: Canvas, cx: number, cy: number, r: number, mood: Mood, t: number, base = skin) {
  const tone = mood === 'angry' ? hex('#ff6b57') : base
  c.circle(cx, cy, r, mood === 'angry' ? hex('#c43d2a') : skinDark)
  c.circle(cx, cy - r * 0.02, r * 0.94, tone)
  const eyeY = cy - r * 0.12
  const eyeDX = r * 0.38
  switch (mood) {
    case 'laugh': {
      c.ring(cx - eyeDX, eyeY + r * 0.06, r * 0.16, r * 0.1, ink, Math.PI, TAU)
      c.ring(cx + eyeDX, eyeY + r * 0.06, r * 0.16, r * 0.1, ink, Math.PI, TAU)
      const open = 0.62 + 0.18 * Math.abs(wave(t, 4))
      c.ellipse(cx, cy + r * 0.28, r * 0.5, r * 0.34 * open + r * 0.08, hex('#6b1d2a'))
      c.ellipse(cx, cy + r * 0.42, r * 0.34, r * 0.14, hex('#ff7a90'))
      c.rect(cx - r * 0.42, cy + r * 0.0, r * 0.84, r * 0.1, white)
      break
    }
    case 'cry': {
      c.ellipse(cx - eyeDX, eyeY, r * 0.12, r * 0.17, ink)
      c.ellipse(cx + eyeDX, eyeY, r * 0.12, r * 0.17, ink)
      c.circle(cx - eyeDX + r * 0.04, eyeY - r * 0.06, r * 0.04, white)
      c.circle(cx + eyeDX + r * 0.04, eyeY - r * 0.06, r * 0.04, white)
      c.ring(cx, cy + r * 0.56, r * 0.26, r * 0.09, ink, Math.PI * 1.1, Math.PI * 1.9)
      for (const side of [-1, 1])
        for (let drop = 0; drop < 3; drop++) {
          const progress = (t * 2 + drop / 3) % 1
          const dx = cx + side * (eyeDX + r * 0.04)
          const dy = eyeY + r * 0.2 + progress * r * 1.0
          c.ellipse(dx, dy, r * 0.07, r * 0.11, tear)
        }
      break
    }
    case 'shock': {
      c.circle(cx - eyeDX, eyeY, r * 0.2, white)
      c.circle(cx + eyeDX, eyeY, r * 0.2, white)
      c.circle(cx - eyeDX, eyeY, r * 0.2, white)
      c.circle(cx - eyeDX + wave(t, 6) * r * 0.03, eyeY, r * 0.07, ink)
      c.circle(cx + eyeDX + wave(t, 6) * r * 0.03, eyeY, r * 0.07, ink)
      c.ellipse(
        cx,
        cy + r * 0.42,
        r * 0.17,
        r * 0.24 + Math.abs(wave(t, 3)) * r * 0.04,
        hex('#6b1d2a')
      )
      break
    }
    case 'sleep': {
      c.line(cx - eyeDX - r * 0.13, eyeY, cx - eyeDX + r * 0.13, eyeY, r * 0.08, ink)
      c.line(cx + eyeDX - r * 0.13, eyeY, cx + eyeDX + r * 0.13, eyeY, r * 0.08, ink)
      c.ellipse(
        cx,
        cy + r * 0.4,
        r * 0.12,
        r * 0.09 + Math.abs(wave(t, 1)) * r * 0.05,
        hex('#6b1d2a')
      )
      break
    }
    case 'angry': {
      c.line(
        cx - eyeDX - r * 0.2,
        eyeY - r * 0.2,
        cx - eyeDX + r * 0.18,
        eyeY - r * 0.05,
        r * 0.09,
        ink
      )
      c.line(
        cx + eyeDX + r * 0.2,
        eyeY - r * 0.2,
        cx + eyeDX - r * 0.18,
        eyeY - r * 0.05,
        r * 0.09,
        ink
      )
      c.circle(cx - eyeDX, eyeY + r * 0.08, r * 0.09, ink)
      c.circle(cx + eyeDX, eyeY + r * 0.08, r * 0.09, ink)
      c.ring(cx, cy + r * 0.62, r * 0.3, r * 0.09, ink, Math.PI * 1.15, Math.PI * 1.85)
      break
    }
    case 'think': {
      c.circle(cx - eyeDX, eyeY, r * 0.15, white)
      c.circle(cx + eyeDX, eyeY, r * 0.15, white)
      const look = wave(t, 1) * r * 0.05
      c.circle(cx - eyeDX + look, eyeY - r * 0.07, r * 0.07, ink)
      c.circle(cx + eyeDX + look, eyeY - r * 0.07, r * 0.07, ink)
      c.line(
        cx + eyeDX - r * 0.16,
        eyeY - r * 0.28,
        cx + eyeDX + r * 0.18,
        eyeY - r * 0.34,
        r * 0.07,
        ink
      )
      c.line(cx - r * 0.2, cy + r * 0.42, cx + r * 0.2, cy + r * 0.36, r * 0.08, ink)
      break
    }
    case 'love': {
      const pulse = 1 + 0.12 * wave(t, 3)
      heart(c, cx - eyeDX, eyeY, r * 0.36 * pulse, heartPink)
      heart(c, cx + eyeDX, eyeY, r * 0.36 * pulse, heartPink)
      c.ellipse(cx - r * 0.62, cy + r * 0.22, r * 0.14, r * 0.08, hex('#ff9fb2'))
      c.ellipse(cx + r * 0.62, cy + r * 0.22, r * 0.14, r * 0.08, hex('#ff9fb2'))
      c.ring(cx, cy + r * 0.28, r * 0.3, r * 0.09, ink, Math.PI * 0.12, Math.PI * 0.88)
      break
    }
    case 'cool': {
      c.roundRect(cx - r * 0.72, eyeY - r * 0.17, r * 0.6, r * 0.34, r * 0.1, ink)
      c.roundRect(cx + r * 0.12, eyeY - r * 0.17, r * 0.6, r * 0.34, r * 0.1, ink)
      c.rect(cx - r * 0.14, eyeY - r * 0.1, r * 0.28, r * 0.07, ink)
      c.line(cx - r * 0.6, eyeY - r * 0.08, cx - r * 0.4, eyeY - r * 0.04, r * 0.05, hex('#7bdff2'))
      c.ring(cx, cy + r * 0.24, r * 0.3, r * 0.09, ink, Math.PI * 0.15, Math.PI * 0.8)
      break
    }
  }
}

/** Caption bar with outlined bitmap text at the bottom of the frame. */
function caption(c: Canvas, text: string | null) {
  if (!text) return
  const size = fitText(text, SIZE - 12)
  const height = 7 * size + 14
  c.rect(0, SIZE - height, SIZE, height, hex('#0b1020'))
  c.rect(0, SIZE - height, SIZE, 2, hex('#ffffff'))
  c.text(text, SIZE / 2 + size, SIZE - height + 7 + size, size, hex('#000000'), 'center')
  c.text(text, SIZE / 2, SIZE - height + 7, size, white, 'center')
}

/** Where the artwork may sit above the caption. */
const stageBottom = (text: string | null) =>
  text ? SIZE - (7 * fitText(text, SIZE - 12) + 14) : SIZE

type Scene = (c: Canvas, t: number, text: string | null) => void

const scenes: Record<
  string,
  { bg: [string, string]; caption: string; delay: number; frames: number; scene: Scene }
> = {
  kahkaha: {
    bg: ['#ff9a3c', '#ff4d6d'],
    caption: 'HAHAHA',
    delay: 6,
    frames: 12,
    scene: (c, t, text) => {
      const mid = stageBottom(text) / 2
      const hop = bounce(t, 4) * 7
      face(c, 80 + wave(t, 2) * 2, mid + 4 - hop, 44, 'laugh', t)
      for (const side of [-1, 1])
        c.ellipse(80 + side * 50, mid - 6 - hop + Math.abs(wave(t, 2, side)) * 4, 5, 7, tear)
    },
  },
  aglama: {
    bg: ['#4361ee', '#3a0ca3'],
    caption: 'ÇOK KÖTÜ',
    delay: 7,
    frames: 12,
    scene: (c, t, text) => {
      face(c, 80, stageBottom(text) / 2 + 4, 44, 'cry', t)
    },
  },
  sok: {
    bg: ['#f72585', '#7209b7'],
    caption: 'NASIL YA?!',
    delay: 5,
    frames: 10,
    scene: (c, t, text) => {
      const mid = stageBottom(text) / 2
      face(c, 80 + wave(t, 5) * 4, mid + 4, 44, 'shock', t)
      for (let spark = 0; spark < 6; spark++) {
        const angle = (spark / 6) * TAU + t * 0.4
        const inner = 56 + wave(t, 5, spark / 6) * 3
        c.line(
          80 + Math.cos(angle) * inner,
          mid + 4 + Math.sin(angle) * inner,
          80 + Math.cos(angle) * (inner + 12),
          mid + 4 + Math.sin(angle) * (inner + 12),
          3,
          hex('#ffe066')
        )
      }
    },
  },
  alkis: {
    bg: ['#2ec4b6', '#0b6e99'],
    caption: 'BRAVO',
    delay: 6,
    frames: 10,
    scene: (c, t, text) => {
      const mid = stageBottom(text) / 2
      const gap = 6 + Math.abs(wave(t, 2)) * 28
      for (const side of [-1, 1]) {
        c.roundRect(80 + side * (gap + 10) - 14, mid - 24, 28, 46, 12, skin)
        c.roundRect(80 + side * (gap + 10) - 14, mid - 24, 28, 46, 12, skin)
        c.line(80 + side * (gap + 10), mid - 24, 80 + side * (gap + 10), mid + 8, 2, skinDark)
      }
      if (gap < 16)
        for (let spark = -2; spark <= 2; spark++)
          c.line(80 + spark * 12, mid - 34, 80 + spark * 17, mid - 48, 3, hex('#ffe066'))
    },
  },
  kalp: {
    bg: ['#ff758f', '#c9184a'],
    caption: 'AŞKIM BU SERİ',
    delay: 6,
    frames: 12,
    scene: (c, t, text) => {
      const mid = stageBottom(text) / 2
      const size = 74 + 16 * Math.max(0, wave(t, 2))
      heart(c, 80, mid + 8, size, white)
      heart(c, 80, mid + 8, size * 0.82, hex('#ff4d6d'))
      for (let spark = 0; spark < 5; spark++) {
        const progress = (t + spark / 5) % 1
        heart(c, 30 + spark * 25, mid + 40 - progress * 70, 10 + (spark % 2) * 4, hex('#ffe3ea'))
      }
    },
  },
  ates: {
    bg: ['#3d0a05', '#7a1b0c'],
    caption: 'ALEV ALEV',
    delay: 5,
    frames: 12,
    scene: (c, t, text) => {
      const base = stageBottom(text) - 8
      const flicker = (phase: number) => wave(t, 2, phase) * 4
      c.polygon(
        [
          [80 + flicker(0), base - 94],
          [112, base - 30],
          [104, base],
          [56, base],
          [48, base - 30],
        ],
        hex('#ff5400')
      )
      c.polygon(
        [
          [80 + flicker(0.3), base - 70],
          [102, base - 24],
          [96, base],
          [64, base],
          [58, base - 24],
        ],
        hex('#ff9e00')
      )
      c.polygon(
        [
          [80 + flicker(0.6), base - 44],
          [92, base - 14],
          [88, base],
          [72, base],
          [68, base - 14],
        ],
        hex('#ffe066')
      )
      for (let spark = 0; spark < 6; spark++) {
        const progress = (t + spark / 6) % 1
        c.circle(
          56 + spark * 10 + wave(t, 1, spark) * 3,
          base - progress * 110,
          2.5 * (1 - progress) + 1,
          hex('#ffb703')
        )
      }
    },
  },
  uyku: {
    bg: ['#22223b', '#4a4e69'],
    caption: 'BÖLÜM NE ZAMAN',
    delay: 8,
    frames: 12,
    scene: (c, t, text) => {
      const mid = stageBottom(text) / 2
      face(c, 70, mid + 8 + wave(t, 1) * 2, 38, 'sleep', t)
      for (let z = 0; z < 3; z++) {
        const progress = (t + z / 3) % 1
        c.text(
          'Z',
          104 + progress * 22,
          mid - 6 - progress * 46,
          2 + (z % 2),
          mix(hex('#c9ada7'), white, progress)
        )
      }
    },
  },
  dans: {
    bg: ['#7b2cbf', '#240046'],
    caption: 'GEL BÖLÜM GEL',
    delay: 6,
    frames: 12,
    scene: (c, t, text) => {
      const mid = stageBottom(text) / 2
      const sway = wave(t, 1) * 12
      const hop = bounce(t, 2) * 6
      const headY = mid - 30 - hop
      c.circle(80 + sway * 0.5, headY, 12, skin)
      c.line(80 + sway * 0.5, headY + 12, 80, mid + 14 - hop, 6, white)
      const arm = wave(t, 1)
      c.line(80 + sway * 0.3, headY + 20, 80 - 32, headY + 4 + arm * 18, 5, white)
      c.line(80 + sway * 0.3, headY + 20, 80 + 32, headY + 4 - arm * 18, 5, white)
      c.line(80, mid + 14 - hop, 80 - 18 - sway * 0.5, mid + 46, 5, white)
      c.line(80, mid + 14 - hop, 80 + 18 - sway * 0.5, mid + 46, 5, white)
      for (let note = 0; note < 3; note++) {
        const progress = (t + note / 3) % 1
        c.text(
          '♥',
          28 + note * 46,
          mid + 20 - progress * 60,
          2,
          mix(heartPink, hex('#240046'), progress)
        )
      }
    },
  },
  yildiz: {
    bg: ['#1b1b3a', '#693668'],
    caption: '10/10',
    delay: 7,
    frames: 12,
    scene: (c, t, text) => {
      const mid = stageBottom(text) / 2
      star(c, 80, mid + 4, 44 + wave(t, 2) * 4, hex('#ffd60a'), wave(t, 1) * 0.15)
      star(c, 80, mid + 4, 28 + wave(t, 2) * 3, hex('#fff3a6'), wave(t, 1) * 0.15)
      for (let sparkle = 0; sparkle < 6; sparkle++) {
        const phase = (t + sparkle / 6) % 1
        star(
          c,
          24 + ((sparkle * 53) % 112),
          18 + ((sparkle * 37) % 70),
          3 + Math.sin(phase * Math.PI) * 6,
          white
        )
      }
    },
  },
  kizgin: {
    bg: ['#d00000', '#370617'],
    caption: 'NASIL BÖYLE BİTER',
    delay: 6,
    frames: 10,
    scene: (c, t, text) => {
      const mid = stageBottom(text) / 2
      face(c, 80 + wave(t, 6) * 1.5, mid + 8, 40, 'angry', t)
      for (const side of [-1, 1])
        for (let puff = 0; puff < 2; puff++) {
          const progress = (t + puff / 2) % 1
          c.circle(
            80 + side * (36 + progress * 12),
            mid - 30 - progress * 26,
            4 + progress * 7,
            mix(white, hex('#370617'), progress)
          )
        }
    },
  },
  dusunuyor: {
    bg: ['#0077b6', '#023e8a'],
    caption: 'HMM…',
    delay: 8,
    frames: 12,
    scene: (c, t, text) => {
      const mid = stageBottom(text) / 2
      face(c, 66, mid + 10, 38, 'think', t)
      c.circle(112, mid - 10, 4, white)
      c.circle(122, mid - 24, 6 + Math.abs(wave(t, 1)) * 2, white)
      c.ellipse(132, mid - 44, 22, 14, white)
      c.text('?', 132 + wave(t, 2), mid - 52, 2, hex('#0077b6'), 'center')
    },
  },
  konfeti: {
    bg: ['#3a86ff', '#8338ec'],
    caption: 'YENİ BÖLÜM!',
    delay: 6,
    frames: 14,
    scene: (c, t, text) => {
      const colors = ['#ffbe0b', '#fb5607', '#ff006e', '#06d6a0', '#ffffff'].map(hex)
      const bottom = stageBottom(text)
      for (let piece = 0; piece < 44; piece++) {
        const speed = 1 + (piece % 3)
        const progress = (t * (speed > 2 ? 1 : 1) + piece * 0.137) % 1
        const x = 6 + ((piece * 47) % 148) + wave(t, speed, piece * 0.1) * 6
        const y = -8 + progress * (bottom + 16)
        c.roundRect(x - 3, y - 2, 6, 4 + (piece % 3) * 2, 1.5, colors[piece % colors.length])
      }
      c.text('!', 80, bottom / 2 - 16, 4, white, 'center')
    },
  },
  gg: {
    bg: ['#00f5d4', '#9b5de5'],
    caption: 'OYUN BİTTİ',
    delay: 7,
    frames: 12,
    scene: (c, t, text) => {
      const mid = stageBottom(text) / 2
      const pulse = 1 + wave(t, 2) * 0.06
      const size = Math.max(4, Math.round(8 * pulse))
      const width = textWidth('GG', size)
      c.text('GG', 80 - width / 2 + size, mid - 3.5 * size + size, size, hex('#1b1b3a'), 'left')
      c.text('GG', 80 - width / 2, mid - 3.5 * size, size, white, 'left')
    },
  },
  yukleniyor: {
    bg: ['#212529', '#495057'],
    caption: 'BÖLÜM YÜKLENİYOR',
    delay: 6,
    frames: 12,
    scene: (c, t, text) => {
      const mid = stageBottom(text) / 2
      c.ring(80, mid, 30, 8, hex('#6c757d'))
      c.ring(80, mid, 30, 8, hex('#06d6a0'), t * TAU, t * TAU + Math.PI * 0.9)
      c.text('%' + String(Math.floor(t * 99)).padStart(2, '0'), 80, mid - 7, 2, white, 'center')
    },
  },
}

export interface DemoGif {
  slug: string
  /** Display name, also used as the sticker name. */
  title: string
  spec: AnimationSpec
}

function build(slug: string, withCaption: boolean): AnimationSpec {
  const source = scenes[slug]
  const [top, bottom] = source.bg.map(hex)
  const text = withCaption ? source.caption : null
  return {
    slug: withCaption ? slug : `${slug}-sticker`,
    title: source.caption,
    width: SIZE,
    height: SIZE,
    frames: source.frames,
    delay: source.delay,
    draw: (canvas, t) => {
      canvas.gradient(top, bottom, 60)
      source.scene(canvas, t, text)
      caption(canvas, text)
    },
  }
}

export const gifSlugs = Object.keys(scenes)
/** Captioned reaction GIFs for comments. */
export const reactionGifs: DemoGif[] = gifSlugs.map((slug) => ({
  slug,
  title: scenes[slug].caption,
  spec: build(slug, true),
}))
/** Caption-free loops used as animated stickers. */
export const stickerGifs: { slug: string; name: string; spec: AnimationSpec }[] = [
  ['kahkaha', 'Gülen Surat'],
  ['kalp', 'Atan Kalp'],
  ['ates', 'Alev'],
  ['yildiz', 'Parlayan Yıldız'],
  ['dans', 'Dans Eden'],
  ['uyku', 'Horlayan'],
  ['sok', 'Şaşkın'],
  ['aglama', 'Ağlayan'],
].map(([slug, name]) => ({ slug: `${slug}-sticker`, name, spec: build(slug, false) }))
