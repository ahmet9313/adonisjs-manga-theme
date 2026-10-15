import { createRng, hashSeed } from './rng.js'

/**
 * Procedural SVG artwork for the demo data: avatars, profile banners, avatar frames,
 * wallpapers, stickers and alternate-art cards. Everything is deterministic for a given seed.
 */

const esc = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
  )

const svg = (width: number, height: number, body: string, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${extra}>${body}</svg>`

const hsl = (h: number, s: number, l: number, a = 1) =>
  `hsla(${Math.round(h) % 360},${s}%,${l}%,${a})`
const f = (value: number) => Math.round(value * 100) / 100

/* ---- Avatars --------------------------------------------------------------------------- */

export const avatarMotifs = [
  'kedi',
  'tilki',
  'ayi',
  'panda',
  'tavsan',
  'robot',
  'hayalet',
  'uzayli',
  'slime',
  'ninja',
] as const
export type AvatarMotif = (typeof avatarMotifs)[number]

interface Palette {
  fur: string
  dark: string
  light: string
  accent: string
  bgA: string
  bgB: string
}

function paletteFor(hue: number): Palette {
  return {
    fur: hsl(hue, 62, 58),
    dark: hsl(hue, 55, 28),
    light: hsl(hue, 70, 88),
    accent: hsl(hue + 150, 80, 62),
    bgA: hsl(hue + 30, 70, 32),
    bgB: hsl(hue + 200, 65, 18),
  }
}

function eyes(cx: number, cy: number, gap: number, size: number, color = '#1b1b2f') {
  return [-1, 1]
    .map(
      (side) =>
        `<ellipse cx="${cx + side * gap}" cy="${cy}" rx="${size}" ry="${size * 1.25}" fill="${color}"/><circle cx="${cx + side * gap + size * 0.35}" cy="${cy - size * 0.45}" r="${size * 0.38}" fill="#fff"/>`
    )
    .join('')
}

export function avatarSvg(seed: string, motif: AvatarMotif, hue: number): string {
  const p = paletteFor(hue)
  const sparkle = createRng(hashSeed(seed))
  const stars = Array.from({ length: 6 }, () => {
    const x = sparkle.int(14, 242)
    const y = sparkle.int(14, 242)
    return `<circle cx="${x}" cy="${y}" r="${sparkle.int(1, 3)}" fill="#fff" opacity="0.35"/>`
  }).join('')
  let body = ''
  switch (motif) {
    case 'kedi':
      body = `<polygon points="52,118 66,34 120,86" fill="${p.fur}"/><polygon points="204,118 190,34 136,86" fill="${p.fur}"/>
        <polygon points="68,100 72,58 100,86" fill="#ffb3c7"/><polygon points="188,100 184,58 156,86" fill="#ffb3c7"/>
        <ellipse cx="128" cy="150" rx="84" ry="76" fill="${p.fur}"/>
        <ellipse cx="128" cy="176" rx="40" ry="28" fill="${p.light}"/>${eyes(128, 140, 34, 9)}
        <polygon points="120,160 136,160 128,170" fill="#ff7a9a"/>
        <path d="M128 170 q-8 12 -18 8 M128 170 q8 12 18 8" stroke="#1b1b2f" stroke-width="3" fill="none" stroke-linecap="round"/>
        <g stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.8"><line x1="60" y1="162" x2="96" y2="168"/><line x1="58" y1="176" x2="94" y2="176"/><line x1="196" y1="162" x2="160" y2="168"/><line x1="198" y1="176" x2="162" y2="176"/></g>`
      break
    case 'tilki':
      body = `<polygon points="46,40 112,96 62,140" fill="${p.fur}"/><polygon points="210,40 144,96 194,140" fill="${p.fur}"/>
        <polygon points="58,58 96,92 70,114" fill="${p.dark}"/><polygon points="198,58 160,92 186,114" fill="${p.dark}"/>
        <path d="M44 126 Q128 76 212 126 Q214 196 128 232 Q42 196 44 126Z" fill="${p.fur}"/>
        <path d="M44 150 Q86 170 128 232 Q90 214 60 186Z M212 150 Q170 170 128 232 Q166 214 196 186Z" fill="#fff6ee"/>
        ${eyes(128, 142, 36, 8)}<ellipse cx="128" cy="204" rx="10" ry="7" fill="#1b1b2f"/>`
      break
    case 'ayi':
      body = `<circle cx="64" cy="76" r="32" fill="${p.fur}"/><circle cx="192" cy="76" r="32" fill="${p.fur}"/>
        <circle cx="64" cy="76" r="17" fill="${p.light}"/><circle cx="192" cy="76" r="17" fill="${p.light}"/>
        <ellipse cx="128" cy="144" rx="88" ry="82" fill="${p.fur}"/>
        <ellipse cx="128" cy="172" rx="42" ry="32" fill="${p.light}"/>${eyes(128, 128, 36, 9)}
        <ellipse cx="128" cy="160" rx="13" ry="9" fill="#1b1b2f"/><path d="M128 169 v10 M128 179 q-10 8 -18 2 M128 179 q10 8 18 2" stroke="#1b1b2f" stroke-width="3" fill="none" stroke-linecap="round"/>`
      break
    case 'panda':
      body = `<circle cx="64" cy="76" r="32" fill="#1b1b2f"/><circle cx="192" cy="76" r="32" fill="#1b1b2f"/>
        <ellipse cx="128" cy="146" rx="88" ry="82" fill="#f7f7fb"/>
        <ellipse cx="90" cy="132" rx="22" ry="30" fill="#1b1b2f" transform="rotate(25 90 132)"/><ellipse cx="166" cy="132" rx="22" ry="30" fill="#1b1b2f" transform="rotate(-25 166 132)"/>
        <circle cx="92" cy="130" r="8" fill="#fff"/><circle cx="164" cy="130" r="8" fill="#fff"/><circle cx="94" cy="132" r="4" fill="#1b1b2f"/><circle cx="162" cy="132" r="4" fill="#1b1b2f"/>
        <ellipse cx="128" cy="168" rx="13" ry="9" fill="#1b1b2f"/><path d="M128 177 q-10 10 -20 3 M128 177 q10 10 20 3" stroke="#1b1b2f" stroke-width="3" fill="none" stroke-linecap="round"/>`
      break
    case 'tavsan':
      body = `<ellipse cx="92" cy="62" rx="22" ry="62" fill="${p.fur}" transform="rotate(-8 92 62)"/><ellipse cx="164" cy="62" rx="22" ry="62" fill="${p.fur}" transform="rotate(8 164 62)"/>
        <ellipse cx="92" cy="66" rx="10" ry="46" fill="#ffb3c7" transform="rotate(-8 92 66)"/><ellipse cx="164" cy="66" rx="10" ry="46" fill="#ffb3c7" transform="rotate(8 164 66)"/>
        <ellipse cx="128" cy="158" rx="82" ry="72" fill="${p.fur}"/>${eyes(128, 148, 32, 9)}
        <ellipse cx="128" cy="172" rx="8" ry="6" fill="#ff7a9a"/><path d="M128 178 q-8 10 -16 4 M128 178 q8 10 16 4" stroke="#1b1b2f" stroke-width="3" fill="none" stroke-linecap="round"/>
        <circle cx="82" cy="172" r="12" fill="#ff9fb2" opacity="0.55"/><circle cx="174" cy="172" r="12" fill="#ff9fb2" opacity="0.55"/>`
      break
    case 'robot':
      body = `<line x1="128" y1="40" x2="128" y2="66" stroke="#c9d1d9" stroke-width="6"/><circle cx="128" cy="36" r="10" fill="${p.accent}"/>
        <rect x="44" y="66" width="168" height="150" rx="34" fill="#cfd8e3"/><rect x="54" y="76" width="148" height="130" rx="26" fill="#2a3342"/>
        <rect x="72" y="104" width="40" height="34" rx="9" fill="${p.accent}"/><rect x="144" y="104" width="40" height="34" rx="9" fill="${p.accent}"/>
        <rect x="80" y="112" width="12" height="12" rx="3" fill="#fff" opacity="0.8"/><rect x="152" y="112" width="12" height="12" rx="3" fill="#fff" opacity="0.8"/>
        <g fill="#cfd8e3"><rect x="84" y="160" width="14" height="30" rx="3"/><rect x="104" y="160" width="14" height="30" rx="3"/><rect x="124" y="160" width="14" height="30" rx="3"/><rect x="144" y="160" width="14" height="30" rx="3"/><rect x="164" y="160" width="10" height="30" rx="3"/></g>
        <circle cx="52" cy="140" r="8" fill="#9aa7b8"/><circle cx="204" cy="140" r="8" fill="#9aa7b8"/>`
      break
    case 'hayalet':
      body = `<path d="M52 224 V120 a76 76 0 0 1 152 0 V224 l-25 -22 -26 22 -25 -22 -25 22 -26 -22Z" fill="#f4f4ff"/>
        <path d="M52 224 V150 q38 22 76 0 q38 22 76 0 V224" fill="#dcdcf7" opacity="0.5"/>${eyes(128, 126, 30, 10)}
        <ellipse cx="128" cy="164" rx="12" ry="16" fill="#1b1b2f"/><circle cx="84" cy="150" r="11" fill="#ffb3c7" opacity="0.6"/><circle cx="172" cy="150" r="11" fill="#ffb3c7" opacity="0.6"/>`
      break
    case 'uzayli':
      body = `<line x1="92" y1="64" x2="76" y2="30" stroke="${p.fur}" stroke-width="6" stroke-linecap="round"/><circle cx="74" cy="26" r="9" fill="${p.accent}"/>
        <line x1="164" y1="64" x2="180" y2="30" stroke="${p.fur}" stroke-width="6" stroke-linecap="round"/><circle cx="182" cy="26" r="9" fill="${p.accent}"/>
        <path d="M128 62 C206 62 222 150 196 196 C176 230 80 230 60 196 C34 150 50 62 128 62Z" fill="hsl(${hue + 90},60%,52%)"/>
        <ellipse cx="94" cy="138" rx="26" ry="38" fill="#10151f" transform="rotate(-24 94 138)"/><ellipse cx="162" cy="138" rx="26" ry="38" fill="#10151f" transform="rotate(24 162 138)"/>
        <ellipse cx="86" cy="124" rx="7" ry="11" fill="#fff" opacity="0.8" transform="rotate(-24 86 124)"/><ellipse cx="170" cy="124" rx="7" ry="11" fill="#fff" opacity="0.8" transform="rotate(24 170 124)"/>
        <path d="M112 196 q16 10 32 0" stroke="#10151f" stroke-width="4" fill="none" stroke-linecap="round"/>`
      break
    case 'slime':
      body = `<path d="M128 48 C150 48 160 78 188 96 C226 118 232 190 198 210 C170 226 86 226 58 210 C24 190 30 118 68 96 C96 78 106 48 128 48Z" fill="${p.fur}"/>
        <path d="M70 110 C90 90 110 82 124 64" stroke="#fff" stroke-width="10" stroke-linecap="round" fill="none" opacity="0.45"/>${eyes(128, 150, 34, 12)}
        <path d="M108 184 q20 18 40 0" stroke="#1b1b2f" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="190" cy="124" rx="9" ry="14" fill="#fff" opacity="0.35" transform="rotate(30 190 124)"/>`
      break
    case 'ninja':
      body = `<circle cx="128" cy="140" r="86" fill="#1c2233"/><path d="M42 124 Q128 96 214 124 V158 Q128 140 42 158Z" fill="#f2c9a0"/>
        <ellipse cx="94" cy="140" rx="12" ry="10" fill="#1b1b2f"/><ellipse cx="162" cy="140" rx="12" ry="10" fill="#1b1b2f"/>
        <circle cx="98" cy="136" r="4" fill="#fff"/><circle cx="166" cy="136" r="4" fill="#fff"/>
        <rect x="42" y="88" width="172" height="26" rx="6" fill="${p.accent}"/><rect x="104" y="90" width="48" height="22" rx="4" fill="#d9dee7"/>
        <path d="M118 101 l10 -7 l10 7 l-10 7Z" fill="#6b7280"/><path d="M214 100 l30 -14 M214 108 l34 8" stroke="${p.accent}" stroke-width="8" stroke-linecap="round"/>`
      break
  }
  return svg(
    256,
    256,
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bgA}"/><stop offset="1" stop-color="${p.bgB}"/></linearGradient></defs>
    <rect width="256" height="256" fill="url(#bg)"/>${stars}${body}`
  )
}

/* ---- Profile banners ------------------------------------------------------------------- */

export function bannerSvg(seed: string, hue: number): string {
  const rng = createRng(hashSeed(seed))
  const style = rng.int(0, 3)
  const a = hsl(hue, 70, 40)
  const b = hsl(hue + 60, 70, 22)
  let art = ''
  if (style === 0) {
    art = [0, 1, 2]
      .map((layer) => {
        const y = 250 + layer * 70
        let d = `M0 ${y}`
        for (let x = 0; x <= 1500; x += 150)
          d += ` Q${x + 75} ${y + rng.int(-70, 70)} ${x + 150} ${y}`
        return `<path d="${d} V500 H0Z" fill="${hsl(hue + layer * 25, 65, 52 - layer * 12, 0.55)}"/>`
      })
      .join('')
  } else if (style === 1) {
    art =
      Array.from(
        { length: 70 },
        () =>
          `<circle cx="${rng.int(0, 1500)}" cy="${rng.int(0, 440)}" r="${f(rng.next() * 2.5 + 0.5)}" fill="#fff" opacity="${f(rng.next() * 0.7 + 0.2)}"/>`
      ).join('') +
      `<circle cx="${rng.int(250, 1250)}" cy="${rng.int(120, 320)}" r="${rng.int(60, 110)}" fill="${hsl(hue + 40, 80, 70, 0.28)}"/>`
  } else if (style === 2) {
    let x = 0
    let skyline = ''
    while (x < 1500) {
      const w = rng.int(50, 120)
      const h = rng.int(90, 300)
      skyline += `<rect x="${x}" y="${500 - h}" width="${w}" height="${h}" fill="${hsl(hue, 45, 10 + (x % 3) * 3)}"/>`
      for (let wy = 500 - h + 14; wy < 490; wy += 22)
        for (let wx = x + 10; wx < x + w - 10; wx += 18)
          if (rng.chance(0.28))
            skyline += `<rect x="${wx}" y="${wy}" width="8" height="10" fill="${hsl(50, 90, 70, 0.85)}"/>`
      x += w + rng.int(0, 10)
    }
    art = `<circle cx="${rng.int(200, 1300)}" cy="120" r="46" fill="#fff6d6" opacity="0.9"/>${skyline}`
  } else {
    art = Array.from({ length: 16 }, () => {
      const x = rng.int(-100, 1500)
      const y = rng.int(0, 480)
      return `<circle cx="${x}" cy="${y}" r="${rng.int(30, 130)}" fill="${hsl(hue + rng.int(-40, 80), 75, 58, 0.18)}"/>`
    }).join('')
  }
  return svg(
    1500,
    500,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1500" height="500" fill="url(#g)"/>${art}`
  )
}

/* ---- Avatar frames (drawn over the avatar; ring radius ~38–42 of 100) ------------------- */

export type FrameStyle =
  | 'ring'
  | 'dashed'
  | 'double'
  | 'rays'
  | 'petals'
  | 'hearts'
  | 'catears'
  | 'halo'
  | 'crown'
  | 'wings'
  | 'flames'
  | 'stars'
  | 'pixel'
  | 'laurel'
  | 'snow'
  | 'circuit'

function polar(radius: number, degrees: number) {
  const angle = (degrees * Math.PI) / 180
  return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius] as const
}

export function frameSvg(style: FrameStyle, c1: string, c2: string): string {
  const grad = `<defs><linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter></defs>`
  const ring = (radius = 39, width = 4.5) =>
    `<circle cx="50" cy="50" r="${radius}" fill="none" stroke="${c1}" stroke-width="${width + 2}" opacity="0.55" filter="url(#glow)"/><circle cx="50" cy="50" r="${radius}" fill="none" stroke="url(#r)" stroke-width="${width}"/>`
  let art = ''
  switch (style) {
    case 'ring':
      art = ring()
      break
    case 'dashed':
      art = `<circle cx="50" cy="50" r="40" fill="none" stroke="url(#r)" stroke-width="4" stroke-dasharray="7 5" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="14s" repeatCount="indefinite"/></circle>${ring(37, 1.5)}`
      break
    case 'double':
      art = `<circle cx="50" cy="50" r="37.5" fill="none" stroke="${c1}" stroke-width="2"/><circle cx="50" cy="50" r="42" fill="none" stroke="${c2}" stroke-width="2.5"/>${ring(40, 0.8)}`
      break
    case 'rays':
      art =
        ring(38.5, 3) +
        Array.from({ length: 24 }, (_, i) => {
          const [x1, y1] = polar(41, i * 15)
          const [x2, y2] = polar(i % 2 ? 46 : 49, i * 15)
          return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${i % 2 ? c2 : c1}" stroke-width="2.2" stroke-linecap="round"/>`
        }).join('')
      break
    case 'petals':
      art =
        ring(37.5, 2.5) +
        Array.from({ length: 10 }, (_, i) => {
          const [x, y] = polar(42.5, i * 36)
          return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="7" ry="3.6" fill="${i % 2 ? c1 : c2}" opacity="0.92" transform="rotate(${i * 36} ${f(x)} ${f(y)})"/>`
        }).join('')
      break
    case 'hearts':
      art =
        ring(38, 2.5) +
        Array.from({ length: 8 }, (_, i) => {
          const [x, y] = polar(43.5, i * 45 + 22)
          return `<path transform="translate(${f(x)} ${f(y)}) scale(0.34)" d="M0 8 C-12 -2 -9 -12 0 -6 C9 -12 12 -2 0 8Z" fill="${i % 2 ? c2 : c1}"/>`
        }).join('')
      break
    case 'catears':
      art = `${ring(38.5, 3.5)}<polygon points="20,38 26,6 46,22" fill="url(#r)"/><polygon points="80,38 74,6 54,22" fill="url(#r)"/><polygon points="25,30 28,14 38,23" fill="#ffc2d4"/><polygon points="75,30 72,14 62,23" fill="#ffc2d4"/>`
      break
    case 'halo':
      art = `${ring(38.5, 3)}<ellipse cx="50" cy="9" rx="19" ry="5.5" fill="none" stroke="${c1}" stroke-width="5" opacity="0.5" filter="url(#glow)"/><ellipse cx="50" cy="9" rx="19" ry="5.5" fill="none" stroke="url(#r)" stroke-width="3"/>`
      break
    case 'crown':
      art = `${ring(38.5, 3)}<path d="M28 18 L34 4 L42 14 L50 0 L58 14 L66 4 L72 18Z" fill="url(#r)" stroke="${c2}" stroke-width="1"/><circle cx="34" cy="5" r="2.2" fill="#ff4d6d"/><circle cx="50" cy="1.5" r="2.4" fill="#4cc9f0"/><circle cx="66" cy="5" r="2.2" fill="#ff4d6d"/><rect x="28" y="16" width="44" height="4" rx="1.5" fill="${c2}"/>`
      break
    case 'wings': {
      const wing = (mirror: number) =>
        `<g transform="translate(50 54) scale(${mirror} 1)"><path d="M36 -6 C54 -26 76 -22 84 -34 C82 -12 90 -6 78 6 C84 8 80 20 66 22 C70 26 58 34 46 28 C40 22 38 8 36 -6Z" fill="url(#r)" opacity="0.95"/><path d="M42 0 C56 -12 70 -12 80 -22 M44 8 C58 2 70 2 78 -6 M46 16 C58 12 66 12 72 6" stroke="#fff" stroke-width="1.2" fill="none" opacity="0.7"/></g>`
      art = `${wing(1)}${wing(-1)}${ring(38.5, 3)}`
      break
    }
    case 'flames':
      art =
        ring(38, 2.5) +
        Array.from({ length: 11 }, (_, i) => {
          const [x, y] = polar(41, 130 + i * 28)
          const rotate = 130 + i * 28 + 90
          return `<g transform="translate(${f(x)} ${f(y)}) rotate(${rotate})"><path d="M0 0 C-5 -4 -3 -12 0 -17 C3 -12 5 -4 0 0Z" fill="${i % 2 ? c1 : c2}"><animate attributeName="opacity" values="1;0.55;1" dur="${1.1 + (i % 4) * 0.25}s" repeatCount="indefinite"/></path></g>`
        }).join('')
      break
    case 'stars':
      art = `${ring(38, 2.5)}<g>${Array.from({ length: 6 }, (_, i) => {
        const [x, y] = polar(43, i * 60)
        return `<path transform="translate(${f(x)} ${f(y)}) scale(0.5)" d="M0 -6 L1.8 -1.8 L6 0 L1.8 1.8 L0 6 L-1.8 1.8 L-6 0 L-1.8 -1.8Z" fill="${i % 2 ? c2 : c1}"/>`
      }).join(
        ''
      )}<animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="10s" repeatCount="indefinite"/></g>`
      break
    case 'pixel':
      art = Array.from({ length: 24 }, (_, i) => {
        const [x, y] = polar(39.5, i * 15)
        return `<rect x="${f(x - 3)}" y="${f(y - 3)}" width="6" height="6" fill="${i % 2 ? c1 : c2}"/>`
      }).join('')
      break
    case 'laurel':
      art =
        ring(36.5, 1.5) +
        [-1, 1]
          .map((side) =>
            Array.from({ length: 7 }, (_, i) => {
              const degrees = 90 + side * (20 + i * 22)
              const [x, y] = polar(41, degrees)
              return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="6.5" ry="2.8" fill="${i % 2 ? c1 : c2}" transform="rotate(${degrees + 90 + side * -35} ${f(x)} ${f(y)})"/>`
            }).join('')
          )
          .join('')
      break
    case 'snow':
      art =
        ring(38, 3) +
        Array.from({ length: 8 }, (_, i) => {
          const [x, y] = polar(44, i * 45)
          return `<g transform="translate(${f(x)} ${f(y)})" stroke="${i % 2 ? c1 : '#fff'}" stroke-width="1.4" stroke-linecap="round"><line x1="-3.5" y1="0" x2="3.5" y2="0"/><line x1="0" y1="-3.5" x2="0" y2="3.5"/><line x1="-2.5" y1="-2.5" x2="2.5" y2="2.5"/><line x1="2.5" y1="-2.5" x2="-2.5" y2="2.5"/></g>`
        }).join('')
      break
    case 'circuit':
      art = `<circle cx="50" cy="50" r="39" fill="none" stroke="${c2}" stroke-width="1.6" opacity="0.6"/><circle cx="50" cy="50" r="39" fill="none" stroke="url(#r)" stroke-width="3.2" stroke-dasharray="26 12 6 12"><animate attributeName="stroke-dashoffset" from="0" to="-112" dur="3.5s" repeatCount="indefinite"/></circle>${Array.from(
        { length: 8 },
        (_, i) => {
          const [x, y] = polar(43.5, i * 45 + 10)
          return `<circle cx="${f(x)}" cy="${f(y)}" r="1.8" fill="${c1}"/>`
        }
      ).join('')}`
      break
  }
  return svg(100, 100, grad + art)
}

/* ---- Wallpapers ------------------------------------------------------------------------ */

export type WallpaperStyle =
  | 'stripes'
  | 'waves'
  | 'halftone'
  | 'hex'
  | 'topo'
  | 'starfield'
  | 'mesh'
  | 'petals'
  | 'city'
  | 'mountains'
  | 'triangles'
  | 'plaid'
  | 'circuit'
  | 'rain'
  | 'aurora'
  | 'synth'
  | 'speed'
  | 'checker'
  | 'bubbles'
  | 'seigaiha'

export function wallpaperSvg(style: WallpaperStyle, hue: number, seed: string): string {
  const rng = createRng(hashSeed(`${style}:${seed}`))
  const W = 800
  const H = 400
  const dark = hsl(hue, 55, 10)
  const mid = hsl(hue, 60, 24)
  const light = hsl(hue + 20, 75, 62)
  const accent = hsl(hue + 150, 80, 62)
  let art = ''
  const bg = (a: string, b: string, angle = 'x1="0" y1="0" x2="1" y2="1"') =>
    `<defs><linearGradient id="bg" ${angle}><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#bg)"/>`
  switch (style) {
    case 'stripes':
      art =
        bg(dark, mid) +
        Array.from(
          { length: 22 },
          (_, i) =>
            `<rect x="${i * 60 - 200}" y="-50" width="26" height="560" fill="${light}" opacity="0.1" transform="rotate(28 400 200)"/>`
        ).join('')
      break
    case 'waves':
      art =
        bg(dark, hsl(hue + 40, 60, 20), 'x1="0" y1="0" x2="0" y2="1"') +
        [0, 1, 2, 3, 4]
          .map((i) => {
            const y = 140 + i * 48
            let d = `M0 ${y}`
            for (let x = 0; x <= W; x += 100)
              d += ` Q${x + 50} ${y + (i % 2 ? 26 : -26)} ${x + 100} ${y}`
            return `<path d="${d} V${H} H0Z" fill="${hsl(hue + i * 14, 70, 30 + i * 6, 0.5)}"/>`
          })
          .join('')
      break
    case 'halftone': {
      const dots: string[] = []
      for (let y = 0; y < H; y += 20)
        for (let x = 0; x < W; x += 20) {
          const radius = Math.max(0, 8 * (1 - x / W) * (0.55 + 0.45 * Math.sin(y / 60)))
          if (radius > 0.6)
            dots.push(
              `<circle cx="${x + (y % 40 ? 10 : 0)}" cy="${y}" r="${f(radius)}" fill="${light}" opacity="0.5"/>`
            )
        }
      art = bg(dark, mid) + dots.join('')
      break
    }
    case 'hex': {
      const cells: string[] = []
      for (let row = 0; row < 12; row++)
        for (let col = 0; col < 18; col++) {
          const cx = col * 52 + (row % 2 ? 26 : 0)
          const cy = row * 45
          cells.push(
            `<polygon points="${[0, 1, 2, 3, 4, 5].map((k) => `${f(cx + Math.cos((k * Math.PI) / 3 + Math.PI / 6) * 29)},${f(cy + Math.sin((k * Math.PI) / 3 + Math.PI / 6) * 29)}`).join(' ')}" fill="none" stroke="${light}" stroke-width="1.2" opacity="${f(0.1 + rng.next() * 0.28)}"/>`
          )
        }
      art = bg(dark, mid) + cells.join('')
      break
    }
    case 'topo':
      art =
        bg(dark, mid) +
        Array.from(
          { length: 12 },
          (_, i) =>
            `<ellipse cx="${rng.int(280, 520)}" cy="${rng.int(140, 260)}" rx="${40 + i * 38}" ry="${24 + i * 22}" fill="none" stroke="${light}" stroke-width="1.4" opacity="${f(0.55 - i * 0.04)}" transform="rotate(${i * 7} 400 200)"/>`
        ).join('')
      break
    case 'starfield':
      art =
        bg('#04050f', dark) +
        Array.from(
          { length: 3 },
          () =>
            `<circle cx="${rng.int(100, 700)}" cy="${rng.int(60, 340)}" r="${rng.int(90, 160)}" fill="${hsl(hue + rng.int(-30, 60), 80, 45, 0.16)}"/>`
        ).join('') +
        Array.from(
          { length: 110 },
          () =>
            `<circle cx="${rng.int(0, W)}" cy="${rng.int(0, H)}" r="${f(rng.next() * 1.8 + 0.3)}" fill="#fff" opacity="${f(rng.next() * 0.8 + 0.15)}"/>`
        ).join('')
      break
    case 'mesh':
      art =
        bg(dark, dark) +
        `<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter></defs><g filter="url(#b)">${Array.from({ length: 6 }, () => `<circle cx="${rng.int(0, W)}" cy="${rng.int(0, H)}" r="${rng.int(70, 140)}" fill="${hsl(hue + rng.int(-60, 120), 80, 52, 0.8)}"/>`).join('')}</g>`
      break
    case 'petals':
      art =
        bg(hsl(hue, 45, 14), hsl(hue, 50, 8)) +
        Array.from({ length: 46 }, () => {
          const x = rng.int(0, W)
          const y = rng.int(0, H)
          return `<ellipse cx="${x}" cy="${y}" rx="${rng.int(7, 13)}" ry="${rng.int(3, 6)}" fill="${hsl(hue + rng.int(-10, 25), 80, rng.int(70, 88), 0.75)}" transform="rotate(${rng.int(0, 180)} ${x} ${y})"/>`
        }).join('')
      break
    case 'city': {
      let x = 0
      let towers = ''
      while (x < W) {
        const w = rng.int(36, 80)
        const h = rng.int(70, 260)
        towers += `<rect x="${x}" y="${H - h}" width="${w}" height="${h}" fill="${hsl(hue, 40, 7 + (x % 3) * 2)}"/>`
        for (let wy = H - h + 10; wy < H - 8; wy += 16)
          for (let wx = x + 7; wx < x + w - 9; wx += 13)
            if (rng.chance(0.3))
              towers += `<rect x="${wx}" y="${wy}" width="6" height="8" fill="${hsl(48, 95, 68, 0.9)}"/>`
        x += w + rng.int(0, 6)
      }
      art = `${bg(hsl(hue, 60, 20), hsl(hue + 40, 70, 10), 'x1="0" y1="0" x2="0" y2="1"')}<circle cx="${rng.int(140, 660)}" cy="90" r="34" fill="#fff7d6" opacity="0.92"/>${towers}`
      break
    }
    case 'mountains':
      art =
        bg(hsl(hue + 30, 70, 38), hsl(hue - 20, 70, 62), 'x1="0" y1="0" x2="0" y2="1"') +
        `<circle cx="${rng.int(120, 680)}" cy="110" r="42" fill="#fff0c2" opacity="0.9"/>` +
        [0, 1, 2]
          .map((layer) => {
            let d = `M0 ${H}`
            for (let x = 0; x <= W; x += 80) d += ` L${x} ${H - 90 - layer * 50 - rng.int(0, 90)}`
            return `<path d="${d} L${W} ${H}Z" fill="${hsl(hue + 10, 45 - layer * 5, 38 - layer * 11)}"/>`
          })
          .join('')
      break
    case 'triangles': {
      const tris: string[] = []
      for (let row = 0; row < 8; row++)
        for (let col = 0; col < 16; col++) {
          const x = col * 52
          const y = row * 52
          tris.push(
            `<polygon points="${x},${y} ${x + 52},${y} ${x},${y + 52}" fill="${hsl(hue + rng.int(-20, 20), 55, rng.int(14, 36))}"/><polygon points="${x + 52},${y} ${x + 52},${y + 52} ${x},${y + 52}" fill="${hsl(hue + rng.int(-20, 20), 55, rng.int(14, 36))}"/>`
          )
        }
      art = `<rect width="${W}" height="${H}" fill="${dark}"/>${tris.join('')}`
      break
    }
    case 'plaid':
      art =
        bg(dark, mid) +
        Array.from(
          { length: 8 },
          (_, i) =>
            `<rect x="${i * 110 - 20}" y="0" width="${i % 2 ? 24 : 48}" height="${H}" fill="${light}" opacity="0.1"/>`
        ).join('') +
        Array.from(
          { length: 5 },
          (_, i) =>
            `<rect x="0" y="${i * 90 - 10}" width="${W}" height="${i % 2 ? 18 : 36}" fill="${accent}" opacity="0.1"/>`
        ).join('')
      break
    case 'circuit': {
      let lines = ''
      for (let i = 0; i < 18; i++) {
        let x = rng.int(0, W)
        let y = rng.int(0, H)
        let d = `M${x} ${y}`
        for (let step = 0; step < 4; step++) {
          x += rng.chance(0.5) ? rng.int(-120, 120) : 0
          y += rng.int(-60, 60)
          d += ` L${x} ${y}`
        }
        lines += `<path d="${d}" fill="none" stroke="${accent}" stroke-width="1.6" opacity="0.4"/><circle cx="${x}" cy="${y}" r="3.5" fill="${accent}" opacity="0.75"/>`
      }
      art = bg(hsl(hue, 70, 8), hsl(hue, 60, 14)) + lines
      break
    }
    case 'rain':
      art =
        bg(hsl(hue, 30, 16), hsl(hue, 40, 8), 'x1="0" y1="0" x2="0" y2="1"') +
        Array.from({ length: 90 }, () => {
          const x = rng.int(0, W)
          const y = rng.int(0, H)
          return `<line x1="${x}" y1="${y}" x2="${x - 8}" y2="${y + rng.int(14, 30)}" stroke="#cfe3ff" stroke-width="1.2" opacity="${f(rng.next() * 0.35 + 0.08)}"/>`
        }).join('')
      break
    case 'aurora':
      art =
        bg('#030712', hsl(hue, 60, 8), 'x1="0" y1="0" x2="0" y2="1"') +
        `<defs><filter id="b" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="22"/></filter></defs><g filter="url(#b)">${[0, 1, 2].map((i) => `<path d="M-40 ${180 + i * 40} C140 ${60 + i * 30} 260 ${300 - i * 20} 420 ${150 + i * 30} S700 ${40 + i * 40} 860 ${200 + i * 20} L860 ${260 + i * 40} L-40 ${300 + i * 40}Z" fill="${hsl(hue + i * 55, 85, 55, 0.5)}"/>`).join('')}</g>`
      break
    case 'synth': {
      const grid: string[] = []
      for (let i = 0; i < 14; i++)
        grid.push(
          `<line x1="${400 + (i - 7) * 18}" y1="240" x2="${400 + (i - 7) * 150}" y2="${H}" stroke="${accent}" stroke-width="1.2" opacity="0.55"/>`
        )
      for (let i = 0; i < 6; i++)
        grid.push(
          `<line x1="0" y1="${250 + i * i * 4.5}" x2="${W}" y2="${250 + i * i * 4.5}" stroke="${accent}" stroke-width="1.2" opacity="0.5"/>`
        )
      art = `${bg('#12002f', hsl(hue + 300, 70, 28), 'x1="0" y1="0" x2="0" y2="1"')}<circle cx="400" cy="190" r="86" fill="url(#bg)" opacity="0"/><circle cx="400" cy="190" r="80" fill="${hsl(hue + 330, 95, 62)}"/>${[0, 1, 2, 3].map((i) => `<rect x="310" y="${178 + i * 16}" width="180" height="${3 + i * 2}" fill="#12002f"/>`).join('')}<rect x="0" y="240" width="${W}" height="${H - 240}" fill="#12002f"/>${grid.join('')}`
      break
    }
    case 'speed':
      art =
        bg(hsl(hue, 20, 94), hsl(hue, 20, 82)).replace(
          /stop-color="[^"]+"/,
          'stop-color="#ffffff"'
        ) +
        Array.from({ length: 70 }, (_, i) => {
          const angle = (i / 70) * Math.PI * 2 + rng.next() * 0.04
          const inner = rng.int(150, 230)
          return `<line x1="${f(400 + Math.cos(angle) * inner)}" y1="${f(200 + Math.sin(angle) * inner * 0.55)}" x2="${f(400 + Math.cos(angle) * 700)}" y2="${f(200 + Math.sin(angle) * 500)}" stroke="#111" stroke-width="${f(rng.next() * 3 + 0.5)}" opacity="0.85"/>`
        }).join('')
      break
    case 'checker': {
      const squares: string[] = []
      for (let row = 0; row < 10; row++)
        for (let col = 0; col < 20; col++)
          if ((row + col) % 2 === 0)
            squares.push(
              `<rect x="${col * 40}" y="${row * 40}" width="40" height="40" fill="${light}" opacity="${f(0.04 + (col / 20) * 0.14)}"/>`
            )
      art = bg(dark, mid) + squares.join('')
      break
    }
    case 'bubbles':
      art =
        bg(hsl(hue, 70, 30), hsl(hue + 60, 70, 14), 'x1="0" y1="0" x2="0" y2="1"') +
        Array.from(
          { length: 30 },
          () =>
            `<circle cx="${rng.int(0, W)}" cy="${rng.int(0, H)}" r="${rng.int(8, 46)}" fill="none" stroke="#fff" stroke-width="2" opacity="${f(rng.next() * 0.35 + 0.1)}"/>`
        ).join('')
      break
    case 'seigaiha': {
      const arcs: string[] = []
      for (let row = 0; row < 14; row++)
        for (let col = -1; col < 11; col++) {
          const cx = col * 80 + (row % 2 ? 40 : 0)
          const cy = row * 24 + 20
          for (const radius of [38, 28, 18, 8])
            arcs.push(
              `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${radius % 20 === 8 ? mid : dark}" stroke="${light}" stroke-width="1.2" opacity="0.9"/>`
            )
        }
      art = `<rect width="${W}" height="${H}" fill="${dark}"/>${arcs.join('')}`
      break
    }
  }
  return svg(W, H, art, ' preserveAspectRatio="xMidYMid slice"')
}

/* ---- Stickers --------------------------------------------------------------------------- */

export type StickerKind =
  | {
      type: 'face'
      fill: string
      eyes: 'dot' | 'star' | 'heart' | 'closed' | 'wide' | 'spiral' | 'cool' | 'x'
      mouth: 'smile' | 'open' | 'frown' | 'flat' | 'tongue' | 'fang' | 'o' | 'wavy'
      extra?:
        | 'blush'
        | 'tears'
        | 'sweat'
        | 'steam'
        | 'halo'
        | 'horns'
        | 'zzz'
        | 'sparkles'
        | 'bandage'
    }
  | { type: 'tag'; text: string; fill: string; ink: string; rotate?: number }
  | {
      type: 'object'
      object:
        | 'onigiri'
        | 'ramen'
        | 'book'
        | 'katana'
        | 'shield'
        | 'trophy'
        | 'fire'
        | 'sparkles'
        | 'bolt'
        | 'coffee'
    }

function stickerEyes(kind: string) {
  const L = 72
  const R = 128
  switch (kind) {
    case 'star':
      return [L, R]
        .map(
          (x) =>
            `<path transform="translate(${x + 4} 80)" d="M0 -17 L5 -5 L18 -5 L8 3 L12 16 L0 8 L-12 16 L-8 3 L-18 -5 L-5 -5Z" fill="#ffd60a" stroke="#1b1b2f" stroke-width="2.5"/>`
        )
        .join('')
    case 'heart':
      return [L, R]
        .map(
          (x) =>
            `<path transform="translate(${x + 4} 80) scale(1.7)" d="M0 8 C-12 -2 -9 -12 0 -6 C9 -12 12 -2 0 8Z" fill="#ff4d6d"/>`
        )
        .join('')
    case 'closed':
      return [L, R]
        .map(
          (x) =>
            `<path d="M${x - 12} 82 q12 -14 24 0" stroke="#1b1b2f" stroke-width="5" fill="none" stroke-linecap="round"/>`
        )
        .join('')
    case 'wide':
      return [L, R]
        .map(
          (x) =>
            `<circle cx="${x + 4}" cy="80" r="17" fill="#fff" stroke="#1b1b2f" stroke-width="3"/><circle cx="${x + 4}" cy="80" r="6" fill="#1b1b2f"/>`
        )
        .join('')
    case 'spiral':
      return [L, R]
        .map(
          (x) =>
            `<circle cx="${x + 4}" cy="80" r="16" fill="#fff" stroke="#1b1b2f" stroke-width="3"/><path d="M${x + 4} 80 m0 0 a3 3 0 0 1 6 0 a7 7 0 0 1 -14 0 a11 11 0 0 1 22 0" stroke="#1b1b2f" stroke-width="2.6" fill="none"/>`
        )
        .join('')
    case 'cool':
      return `<rect x="46" y="66" width="46" height="28" rx="9" fill="#1b1b2f"/><rect x="108" y="66" width="46" height="28" rx="9" fill="#1b1b2f"/><rect x="90" y="72" width="20" height="6" fill="#1b1b2f"/><line x1="54" y1="72" x2="68" y2="76" stroke="#7bdff2" stroke-width="3" stroke-linecap="round"/>`
    case 'x':
      return [L, R]
        .map(
          (x) =>
            `<path d="M${x - 8} 72 l24 16 M${x + 16} 72 l-24 16" stroke="#1b1b2f" stroke-width="5" stroke-linecap="round"/>`
        )
        .join('')
    default:
      return [L, R]
        .map(
          (x) =>
            `<ellipse cx="${x + 4}" cy="80" rx="9" ry="12" fill="#1b1b2f"/><circle cx="${x + 7}" cy="75" r="3.5" fill="#fff"/>`
        )
        .join('')
  }
}

function stickerMouth(kind: string) {
  switch (kind) {
    case 'open':
      return `<path d="M64 118 Q100 164 136 118Z" fill="#6b1d2a" stroke="#1b1b2f" stroke-width="3" stroke-linejoin="round"/><path d="M80 140 Q100 130 120 140 Q100 154 80 140Z" fill="#ff7a90"/>`
    case 'frown':
      return `<path d="M72 144 Q100 116 128 144" stroke="#1b1b2f" stroke-width="6" fill="none" stroke-linecap="round"/>`
    case 'flat':
      return `<line x1="76" y1="136" x2="124" y2="136" stroke="#1b1b2f" stroke-width="6" stroke-linecap="round"/>`
    case 'tongue':
      return `<path d="M66 122 Q100 156 134 122" stroke="#1b1b2f" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M88 138 q12 26 24 0Z" fill="#ff6b8b" stroke="#1b1b2f" stroke-width="3" stroke-linejoin="round"/>`
    case 'fang':
      return `<path d="M64 124 Q100 156 136 124" stroke="#1b1b2f" stroke-width="5" fill="none" stroke-linecap="round"/><polygon points="78,134 88,150 96,138" fill="#fff" stroke="#1b1b2f" stroke-width="2"/><polygon points="122,134 112,150 104,138" fill="#fff" stroke="#1b1b2f" stroke-width="2"/>`
    case 'o':
      return `<ellipse cx="100" cy="140" rx="12" ry="16" fill="#6b1d2a" stroke="#1b1b2f" stroke-width="3"/>`
    case 'wavy':
      return `<path d="M66 138 q9 -12 17 0 t17 0 t17 0 t17 0" stroke="#1b1b2f" stroke-width="5" fill="none" stroke-linecap="round"/>`
    default:
      return `<path d="M68 124 Q100 156 132 124" stroke="#1b1b2f" stroke-width="6" fill="none" stroke-linecap="round"/>`
  }
}

export function stickerSvg(kind: StickerKind): string {
  if (kind.type === 'tag') {
    // Wide fallback fonts need ~0.9em per character; keep the text inside the 136px tag.
    const size = Math.min(64, Math.floor(136 / (Math.max(kind.text.length, 2) * 0.9)))
    return svg(
      200,
      200,
      `<g transform="rotate(${kind.rotate ?? -6} 100 100)"><rect x="18" y="52" width="164" height="96" rx="26" fill="${kind.fill}" stroke="${kind.ink}" stroke-width="7"/><rect x="28" y="62" width="144" height="76" rx="18" fill="none" stroke="#fff" stroke-width="2.5" opacity="0.5"/><text x="100" y="${100 + size * 0.36}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${size}" fill="${kind.ink}">${esc(kind.text)}</text></g>`
    )
  }
  if (kind.type === 'object') {
    const art: Record<string, string> = {
      onigiri: `<path d="M100 28 C124 28 172 124 172 150 C172 172 150 182 100 182 C50 182 28 172 28 150 C28 124 76 28 100 28Z" fill="#fff" stroke="#1b1b2f" stroke-width="6"/><path d="M62 130 H138 V182 H62Z" fill="#1c2a2a" stroke="#1b1b2f" stroke-width="5"/><circle cx="86" cy="100" r="5" fill="#1b1b2f"/><circle cx="114" cy="100" r="5" fill="#1b1b2f"/><path d="M92 112 q8 8 16 0" stroke="#1b1b2f" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
      ramen: `<path d="M26 98 H174 C174 150 142 180 100 180 C58 180 26 150 26 98Z" fill="#e63946" stroke="#1b1b2f" stroke-width="6"/><ellipse cx="100" cy="98" rx="74" ry="16" fill="#ffd166" stroke="#1b1b2f" stroke-width="5"/><circle cx="76" cy="94" r="13" fill="#fff" stroke="#1b1b2f" stroke-width="3"/><circle cx="76" cy="94" r="6" fill="#ffb703"/><path d="M104 88 q12 -10 24 0 t24 0" stroke="#1b1b2f" stroke-width="3.5" fill="none"/><g stroke="#8d6b3f" stroke-width="5" stroke-linecap="round"><line x1="120" y1="30" x2="150" y2="96"/><line x1="136" y1="26" x2="164" y2="90"/></g><path d="M70 52 q-8 -12 0 -22 M96 56 q-8 -12 0 -22" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.7"/>`,
      book: `<rect x="40" y="30" width="124" height="148" rx="10" fill="#3a86ff" stroke="#1b1b2f" stroke-width="6"/><rect x="40" y="30" width="22" height="148" rx="6" fill="#1d4ed8" stroke="#1b1b2f" stroke-width="4"/><rect x="76" y="52" width="76" height="52" rx="6" fill="#fff" stroke="#1b1b2f" stroke-width="4"/><text x="114" y="90" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="30" fill="#e63946">漫画</text><line x1="78" y1="128" x2="150" y2="128" stroke="#fff" stroke-width="5" stroke-linecap="round"/><line x1="78" y1="146" x2="130" y2="146" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.7"/>`,
      katana: `<g transform="rotate(-38 100 100)"><rect x="92" y="12" width="16" height="116" rx="6" fill="#dfe6ee" stroke="#1b1b2f" stroke-width="5"/><rect x="82" y="124" width="36" height="12" rx="4" fill="#ffb703" stroke="#1b1b2f" stroke-width="4"/><rect x="90" y="134" width="20" height="56" rx="7" fill="#7b2cbf" stroke="#1b1b2f" stroke-width="5"/><g stroke="#fff" stroke-width="2.5" opacity="0.6"><line x1="90" y1="148" x2="110" y2="156"/><line x1="90" y1="162" x2="110" y2="170"/></g></g>`,
      shield: `<path d="M100 20 L168 44 V100 C168 142 138 168 100 184 C62 168 32 142 32 100 V44Z" fill="#4361ee" stroke="#1b1b2f" stroke-width="6" stroke-linejoin="round"/><path d="M100 36 L152 54 V100 C152 132 130 152 100 166Z" fill="#4895ef"/><path d="M100 62 l10 22 24 3 -18 16 5 24 -21 -12 -21 12 5 -24 -18 -16 24 -3Z" fill="#ffd60a" stroke="#1b1b2f" stroke-width="3.5" stroke-linejoin="round"/>`,
      trophy: `<path d="M64 32 H136 V84 C136 112 118 126 100 126 C82 126 64 112 64 84Z" fill="#ffd60a" stroke="#1b1b2f" stroke-width="6" stroke-linejoin="round"/><path d="M64 46 H40 C40 78 54 92 70 94 M136 46 H160 C160 78 146 92 130 94" stroke="#1b1b2f" stroke-width="6" fill="none"/><rect x="88" y="124" width="24" height="24" fill="#f4a100" stroke="#1b1b2f" stroke-width="5"/><rect x="66" y="146" width="68" height="26" rx="6" fill="#3a2a14" stroke="#1b1b2f" stroke-width="5"/><path d="M80 44 q-6 28 4 50" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.7"/>`,
      fire: `<path d="M100 18 C112 52 152 70 152 122 C152 158 128 182 100 182 C72 182 48 158 48 122 C48 94 66 84 70 60 C86 74 92 54 100 18Z" fill="#ff5400" stroke="#1b1b2f" stroke-width="6" stroke-linejoin="round"/><path d="M100 80 C108 102 130 112 130 138 C130 158 116 168 100 168 C84 168 70 158 70 138 C70 118 90 108 100 80Z" fill="#ffb703"/><path d="M100 120 C104 134 114 140 114 152 C114 160 108 166 100 166 C92 166 86 160 86 152 C86 140 96 134 100 120Z" fill="#fff3a6"/>`,
      sparkles: `<path d="M100 18 L116 84 L182 100 L116 116 L100 182 L84 116 L18 100 L84 84Z" fill="#ffd60a" stroke="#1b1b2f" stroke-width="6" stroke-linejoin="round"/><path d="M156 24 L162 42 L180 48 L162 54 L156 72 L150 54 L132 48 L150 42Z" fill="#fff" stroke="#1b1b2f" stroke-width="3.5" stroke-linejoin="round"/><path d="M44 130 L49 144 L63 149 L49 154 L44 168 L39 154 L25 149 L39 144Z" fill="#ff8fab" stroke="#1b1b2f" stroke-width="3" stroke-linejoin="round"/>`,
      bolt: `<path d="M118 14 L52 108 H96 L80 186 L152 84 H108Z" fill="#ffd60a" stroke="#1b1b2f" stroke-width="6" stroke-linejoin="round"/>`,
      coffee: `<path d="M44 70 H150 V128 C150 156 128 176 98 176 C68 176 44 156 44 128Z" fill="#fff" stroke="#1b1b2f" stroke-width="6"/><path d="M150 84 H166 C180 84 180 128 150 126" stroke="#1b1b2f" stroke-width="6" fill="none"/><path d="M52 82 H142 V104 C142 112 52 112 52 104Z" fill="#6f4e37"/><path d="M76 50 q-8 -14 0 -26 M102 50 q-8 -14 0 -26 M128 50 q-8 -14 0 -26" stroke="#8d99ae" stroke-width="5" stroke-linecap="round" fill="none"/>`,
    }
    return svg(200, 200, art[kind.object])
  }
  const extras: Record<string, string> = {
    blush: `<ellipse cx="46" cy="116" rx="16" ry="9" fill="#ff7096" opacity="0.6"/><ellipse cx="154" cy="116" rx="16" ry="9" fill="#ff7096" opacity="0.6"/>`,
    tears: `<path d="M58 98 q-8 24 0 34 q8 -10 0 -34Z M146 98 q-8 24 0 34 q8 -10 0 -34Z" fill="#4cc9f0" stroke="#1b1b2f" stroke-width="2"/>`,
    sweat: `<path d="M160 44 q-14 24 0 36 q14 -12 0 -36Z" fill="#4cc9f0" stroke="#1b1b2f" stroke-width="2.5"/>`,
    steam: `<g stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.9"><path d="M40 30 q-12 -14 0 -26"/><path d="M160 30 q12 -14 0 -26"/></g>`,
    halo: `<ellipse cx="100" cy="14" rx="34" ry="9" fill="none" stroke="#ffd60a" stroke-width="7"/>`,
    horns: `<path d="M44 40 L36 6 L74 28Z M156 40 L164 6 L126 28Z" fill="#d00000" stroke="#1b1b2f" stroke-width="4" stroke-linejoin="round"/>`,
    zzz: `<g font-family="Arial Black, Arial" font-weight="900" fill="#fff" stroke="#1b1b2f" stroke-width="1.5"><text x="150" y="40" font-size="30">Z</text><text x="166" y="22" font-size="20">z</text></g>`,
    sparkles: `<path d="M24 36 l5 12 12 5 -12 5 -5 12 -5 -12 -12 -5 12 -5Z M170 150 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4Z" fill="#fff" stroke="#1b1b2f" stroke-width="2"/>`,
    bandage: `<rect x="108" y="30" width="56" height="18" rx="6" fill="#ffd9a8" stroke="#1b1b2f" stroke-width="3" transform="rotate(24 136 40)"/>`,
  }
  return svg(
    200,
    200,
    `<defs><radialGradient id="s" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="${kind.fill}"/><stop offset="1" stop-color="${kind.fill}" stop-opacity="0.82"/></radialGradient></defs>
    ${kind.extra === 'horns' ? extras.horns : ''}<circle cx="100" cy="104" r="86" fill="url(#s)" stroke="#1b1b2f" stroke-width="7"/>
    <ellipse cx="68" cy="52" rx="30" ry="14" fill="#fff" opacity="0.28" transform="rotate(-24 68 52)"/>
    ${stickerEyes(kind.eyes)}${stickerMouth(kind.mouth)}${kind.extra && kind.extra !== 'horns' ? extras[kind.extra] : ''}`
  )
}

/* ---- Cards ------------------------------------------------------------------------------ */

export function cardArtSvg(title: string, rarity: string, hue: number, seed: string): string {
  const rng = createRng(hashSeed(seed))
  const foil = ['A', 'S', 'R'].includes(rarity)
  const accent = hsl(hue + 150, 85, 65)
  const label = title.length > 22 ? `${title.slice(0, 20)}…` : title
  const rays = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2
    return `<polygon points="150,190 ${f(150 + Math.cos(angle) * 320)},${f(190 + Math.sin(angle) * 320)} ${f(150 + Math.cos(angle + 0.1) * 320)},${f(190 + Math.sin(angle + 0.1) * 320)}" fill="#fff" opacity="${i % 2 ? 0.05 : 0.11}"/>`
  }).join('')
  const orbs = Array.from(
    { length: 5 },
    () =>
      `<circle cx="${rng.int(20, 280)}" cy="${rng.int(40, 330)}" r="${rng.int(6, 24)}" fill="${hsl(hue + rng.int(-40, 90), 85, 66, 0.35)}"/>`
  ).join('')
  return svg(
    300,
    420,
    `<defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(hue, 70, 36)}"/><stop offset="1" stop-color="${hsl(hue + 70, 70, 16)}"/></linearGradient></defs>
    <rect width="300" height="420" fill="url(#c)"/>${rays}${orbs}
    <circle cx="150" cy="176" r="86" fill="${hsl(hue, 80, 74, 0.14)}"/><circle cx="150" cy="176" r="64" fill="${hsl(hue, 80, 76, 0.2)}"/>
    <text x="150" y="226" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="150" fill="${accent}" opacity="0.92">${esc((title.trim()[0] || '?').toUpperCase())}</text>
    ${foil ? `<rect x="8" y="8" width="284" height="404" rx="14" fill="none" stroke="#ffd60a" stroke-width="3" opacity="0.9"/><rect x="14" y="14" width="272" height="392" rx="10" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.8"/>` : `<rect x="8" y="8" width="284" height="404" rx="14" fill="none" stroke="#fff" stroke-width="2" opacity="0.4"/>`}
    <rect x="0" y="318" width="300" height="102" fill="rgba(0,0,0,0.62)"/>
    <text x="150" y="360" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="21" fill="#fff">${esc(label)}</text>
    <text x="150" y="388" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="${accent}">Özel Baskı · Seviye ${esc(rarity)}</text>`
  )
}
