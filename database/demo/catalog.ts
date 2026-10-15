import {
  frameSvg,
  stickerSvg,
  wallpaperSvg,
  type FrameStyle,
  type StickerKind,
  type WallpaperStyle,
} from './art.js'
import { stickerGifs } from './animations.js'
import { renderAnimation } from './gif.js'

/**
 * Extra cosmetics for testing the inventory, collection and equip flows: name effects (custom
 * gradients), avatar frames, wallpapers and stickers. Frames, wallpapers and stickers are
 * generated image files; slugs start with `demo-` so they can be told apart (and removed).
 */

export const DEMO_SLUG_PREFIX = 'demo-'

export type ExtraKind = 'effect' | 'frame' | 'wallpaper' | 'sticker'

export interface ExtraCosmetic {
  kind: ExtraKind
  slug: string
  name: string
  level: number
  badge?: string
  grantOnly?: boolean
  featured?: boolean
  /** Name effects store a `grad:` style instead of an image. */
  style?: string
  /** File written under the content root; the row points at `/content/<path>`. */
  file?: { path: string; content: () => string | Buffer }
}

const slugify = (text: string) =>
  text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const effects: [string, string, number, Partial<ExtraCosmetic>?][] = [
  ['Mercan', '#ff7e5f,#feb47b', 1],
  ['Fıstık', '#a8e063,#56ab2f', 2],
  ['Çilek', '#ff9a9e,#fecfef', 3],
  ['Şeftali', '#ffecd2,#fcb69f', 4],
  ['Nane', '#00f5a0,#00d9f5', 6],
  ['Lavanta', '#b8a1ff,#e0d4ff', 7],
  ['Safir', '#4facfe,#00f2fe', 8],
  ['Kehribar', '#ffb347,#ffcc33', 9],
  ['Pamuk Şeker', '#ffc3e0,#c3e8ff,#fff0c3', 11],
  ['Mor Yağmur', '#c471f5,#fa71cd', 13],
  ['Kor', '#ff9966,#ff5e62', 15],
  ['Derin Okyanus', '#00c6ff,#0072ff', 17],
  ['Buzul', '#e0f7ff,#74ebd5,#acb6e5', 19],
  ['Gece Mavisi', '#38bdf8,#6366f1,#a78bfa', 21],
  ['Orkide', '#da70d6,#8a2be2,#4b0082', 24, { featured: true }],
  ['Altın Saat', '#f7971e,#ffd200', 27],
  ['Kızıl Ay', '#ff512f,#dd2476', 30],
  ['Zehir', '#b6ff00,#00ff87', 34],
  ['Şafak', '#ff6a88,#ff99ac,#ffcf70', 38],
  ['Volkan', '#f12711,#f5af19', 45],
  ['Alaca', '#f093fb,#f5576c,#4facfe', 55],
  ['Mürekkep', '#e0e0e0,#9aa0a6,#ffffff', 1, { badge: 'yorumcu' }],
  ['Sis', '#cfd9df,#e2ebf0', 1, { badge: 'elestirmen' }],
  ['Yönetmen', '#fde047,#f472b6,#38bdf8', 1, { grantOnly: true }],
]

const frames: [string, FrameStyle, string, string, number, Partial<ExtraCosmetic>?][] = [
  ['Piksel Çerçeve', 'pixel', '#4ade80', '#22d3ee', 1],
  ['Safir Halka', 'ring', '#38bdf8', '#6366f1', 1],
  ['Gül Halka', 'ring', '#fb7185', '#f43f5e', 3],
  ['Kehribar Halka', 'ring', '#fbbf24', '#f59e0b', 5],
  ['Sakura Yaprakları', 'petals', '#fbcfe8', '#f472b6', 6],
  ['Orman Halka', 'ring', '#4ade80', '#16a34a', 7],
  ['Çift Gümüş', 'double', '#e5e7eb', '#9ca3af', 8],
  ['Kesik Altın', 'dashed', '#fde047', '#f59e0b', 9],
  ['Kedi Kulakları', 'catears', '#fbbf24', '#fb923c', 10, { featured: true }],
  ['Lavanta Yaprakları', 'petals', '#ddd6fe', '#a78bfa', 11],
  ['Kesik Neon', 'dashed', '#22d3ee', '#e879f9', 12],
  ['Kalpli Çerçeve', 'hearts', '#fb7185', '#f9a8d4', 13],
  ['Kar Tanesi', 'snow', '#e0f2fe', '#7dd3fc', 14],
  ['Çift Mor', 'double', '#c084fc', '#7c3aed', 15],
  ['Gece Kedisi', 'catears', '#818cf8', '#4338ca', 16],
  ['Güneş Işınları', 'rays', '#fde047', '#fb923c', 18],
  ['Yörünge Yıldızları', 'stars', '#fde047', '#f0abfc', 19],
  ['Melek Halesi', 'halo', '#fde68a', '#facc15', 20],
  ['Devre', 'circuit', '#22d3ee', '#a78bfa', 21],
  ['Ay Işınları', 'rays', '#e0f2fe', '#93c5fd', 22],
  ['Alevler', 'flames', '#f97316', '#fde047', 24],
  ['Defne Çelengi', 'laurel', '#a3e635', '#facc15', 26],
  ['Melek Kanatları', 'wings', '#ffffff', '#bfdbfe', 28, { featured: true }],
  ['Kral Tacı', 'crown', '#fde047', '#d97706', 30],
  ['Şeytan Kanatları', 'wings', '#f43f5e', '#7f1d1d', 33],
  ['Buz Tacı', 'crown', '#bae6fd', '#38bdf8', 35],
  ['Mavi Alev', 'flames', '#22d3ee', '#6366f1', 40],
  ['Efsane Tacı', 'crown', '#f0abfc', '#7c3aed', 1, { grantOnly: true }],
]

const wallpapers: [string, WallpaperStyle, number, number, Partial<ExtraCosmetic>?][] = [
  ['Çizgili Gece', 'stripes', 235, 1],
  ['Dalgalar', 'waves', 200, 2],
  ['Yarım Ton', 'halftone', 330, 3],
  ['Petek', 'hex', 160, 4],
  ['Kabarcıklar', 'bubbles', 195, 5],
  ['Yıldız Tarlası', 'starfield', 250, 6, { featured: true }],
  ['Sakura Yağmuru', 'petals', 335, 8],
  ['Dama', 'checker', 275, 9],
  ['Topografya', 'topo', 140, 11],
  ['Ekose', 'plaid', 20, 12],
  ['Renk Karışımı', 'mesh', 280, 14],
  ['Düşük Poli', 'triangles', 215, 16],
  ['Gece Şehri', 'city', 225, 18],
  ['Yağmur', 'rain', 210, 20],
  ['Dağ Zirvesi', 'mountains', 25, 23],
  ['Devre Kartı', 'circuit', 170, 26],
  ['Seigaiha Dalgaları', 'seigaiha', 205, 29],
  ['Kuzey Işıkları', 'aurora', 150, 33],
  ['Synthwave', 'synth', 280, 38],
  ['Hız Çizgileri', 'speed', 0, 1, { badge: 'okur' }],
]

const faces: [string, StickerKind, number][] = [
  [
    'Yıldız Gözler',
    { type: 'face', fill: '#ffd23f', eyes: 'star', mouth: 'open', extra: 'sparkles' },
    1,
  ],
  ['Aşık', { type: 'face', fill: '#ffd23f', eyes: 'heart', mouth: 'smile', extra: 'blush' }, 1],
  [
    'Gülmekten Ağlayan',
    { type: 'face', fill: '#ffd23f', eyes: 'closed', mouth: 'open', extra: 'tears' },
    2,
  ],
  ['Mahcup', { type: 'face', fill: '#ffd23f', eyes: 'dot', mouth: 'wavy', extra: 'sweat' }, 3],
  ['Şeytan', { type: 'face', fill: '#ff6b6b', eyes: 'dot', mouth: 'fang', extra: 'horns' }, 5],
  ['Melek', { type: 'face', fill: '#ffe9a8', eyes: 'dot', mouth: 'smile', extra: 'halo' }, 6],
  ['Uykucu', { type: 'face', fill: '#ffd23f', eyes: 'closed', mouth: 'o', extra: 'zzz' }, 7],
  ['Şaşkın', { type: 'face', fill: '#ffd23f', eyes: 'wide', mouth: 'o', extra: 'sweat' }, 8],
  ['Çılgın', { type: 'face', fill: '#ffd23f', eyes: 'spiral', mouth: 'tongue' }, 10],
  ['Havalı Gözlük', { type: 'face', fill: '#ffd23f', eyes: 'cool', mouth: 'smile' }, 12],
  ['Hasta', { type: 'face', fill: '#b5e48c', eyes: 'x', mouth: 'wavy', extra: 'bandage' }, 14],
  ['Öfkeli', { type: 'face', fill: '#ff5d5d', eyes: 'dot', mouth: 'frown', extra: 'steam' }, 16],
  ['Üzgün', { type: 'face', fill: '#8ecae6', eyes: 'dot', mouth: 'frown', extra: 'tears' }, 18],
  ['Dil Çıkaran', { type: 'face', fill: '#ffd23f', eyes: 'closed', mouth: 'tongue' }, 20],
  ['Sakin', { type: 'face', fill: '#ffd6a5', eyes: 'closed', mouth: 'smile', extra: 'blush' }, 22],
]

const objects: [string, StickerKind, number][] = [
  ['Onigiri', { type: 'object', object: 'onigiri' }, 4],
  ['Ramen', { type: 'object', object: 'ramen' }, 9],
  ['Manga Cildi', { type: 'object', object: 'book' }, 13],
  ['Kahve', { type: 'object', object: 'coffee' }, 15],
  ['Katana', { type: 'object', object: 'katana' }, 24],
  ['Kalkan', { type: 'object', object: 'shield' }, 28],
  ['Alev', { type: 'object', object: 'fire' }, 32],
  ['Şimşek', { type: 'object', object: 'bolt' }, 36],
  ['Parıltı', { type: 'object', object: 'sparkles' }, 42],
  ['Kupa', { type: 'object', object: 'trophy' }, 50],
]

const tags: [string, StickerKind, number][] = [
  ['GG', { type: 'tag', text: 'GG', fill: '#80ed99', ink: '#14532d' }, 1],
  ['10/10', { type: 'tag', text: '10/10', fill: '#ffd60a', ink: '#5c4300', rotate: 5 }, 3],
  ['+1', { type: 'tag', text: '+1', fill: '#8ecae6', ink: '#023e8a', rotate: -4 }, 5],
  ['OP', { type: 'tag', text: 'OP', fill: '#ff8fa3', ink: '#800f2f' }, 8],
  ['F', { type: 'tag', text: 'F', fill: '#dee2e6', ink: '#343a40', rotate: 3 }, 11],
  ['HYPE', { type: 'tag', text: 'HYPE', fill: '#c77dff', ink: '#240046', rotate: -7 }, 17],
  ['BRUH', { type: 'tag', text: 'BRUH', fill: '#ffb703', ink: '#3d2c00', rotate: 4 }, 23],
  ['Çok İyi', { type: 'tag', text: 'ÇOK İYİ', fill: '#2ec4b6', ink: '#073b4c', rotate: -5 }, 31],
]

/** Demo accounts reach modest levels, so required levels are compressed to stay reachable. */
const reach = (level: number) => (level <= 1 ? 1 : Math.max(2, Math.round(level * 0.6)))

export function buildExtraCosmetics(): ExtraCosmetic[] {
  const items: ExtraCosmetic[] = []

  for (const [name, colors, level, extra] of effects)
    items.push({
      kind: 'effect',
      slug: `${DEMO_SLUG_PREFIX}efekt-${slugify(name)}`,
      name,
      level: reach(level),
      style: `grad:${colors}`,
      ...extra,
    })

  for (const [name, style, c1, c2, level, extra] of frames) {
    const slug = `${DEMO_SLUG_PREFIX}cerceve-${slugify(name)}`
    items.push({
      kind: 'frame',
      slug,
      name,
      level: reach(level),
      file: { path: `seed/cosmetics/frames/${slug}.svg`, content: () => frameSvg(style, c1, c2) },
      ...extra,
    })
  }

  for (const [name, style, hue, level, extra] of wallpapers) {
    const slug = `${DEMO_SLUG_PREFIX}duvar-${slugify(name)}`
    items.push({
      kind: 'wallpaper',
      slug,
      name,
      level: reach(level),
      file: {
        path: `seed/cosmetics/wallpapers/${slug}.svg`,
        content: () => wallpaperSvg(style, hue, slug),
      },
      ...extra,
    })
  }

  for (const [name, kind, level] of [...faces, ...objects, ...tags]) {
    const slug = `${DEMO_SLUG_PREFIX}cikartma-${slugify(name)}`
    items.push({
      kind: 'sticker',
      slug,
      name,
      level: reach(level),
      file: { path: `seed/cosmetics/stickers/${slug}.svg`, content: () => stickerSvg(kind) },
    })
  }

  stickerGifs.forEach((gif, index) => {
    const slug = `${DEMO_SLUG_PREFIX}cikartma-hareketli-${slugify(gif.name)}`
    items.push({
      kind: 'sticker',
      slug,
      name: `${gif.name} (hareketli)`,
      level: reach(6 + index * 4),
      featured: index === 0,
      file: {
        path: `seed/cosmetics/stickers/${slug}.gif`,
        content: () => renderAnimation(gif.spec),
      },
    })
  })

  return items
}
