/**
 * WCAG contrast check of the theme colours (config/theme.ts) in both schemes, plus the presets.
 * Text must reach 4.5:1, focus rings and icons 3:1. Exit code 1 when a stock pair fails;
 * preset failures are reported as warnings because administrators can edit every colour.
 *
 *   npm run lint:contrast            # stock schemes (fails on errors) + preset warnings
 *   npm run lint:contrast -- --quiet # only problems
 */
import { colorTokens, presets } from '../config/theme.ts'

const quiet = process.argv.includes('--quiet')

/* ---- colour math ------------------------------------------------------------------------- */
const parse = (hex) => {
  const h = hex.replace('#', '')
  const value = (i) => parseInt(h.slice(i, i + 2), 16) / 255
  return { r: value(0), g: value(2), b: value(4), a: h.length === 8 ? value(6) : 1 }
}
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const luminance = ({ r, g, b }) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
/** Alpha-composite `top` over an opaque `bottom`. */
const over = (top, bottom) => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1,
})
const toOklab = ({ r, g, b }) => {
  const [lr, lg, lb] = [r, g, b].map(toLinear)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
const fromOklab = ([L, A, B]) => {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const clamp = (v) => Math.min(1, Math.max(0, toGamma(v)))
  return {
    r: clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: 1,
  }
}
/** CSS `color-mix(in oklab, a p%, b)` for opaque colours. */
const mix = (a, b, p) => {
  const [x, y] = [toOklab(a), toOklab(b)]
  return fromOklab(x.map((v, i) => v * p + y[i] * (1 - p)))
}
/** `color-mix(in oklab, c p%, transparent)` = c with alpha p (premultiplied). */
const fade = (c, p) => ({ ...c, a: p })

/* ---- pairs ----------------------------------------------------------------------------- */
const white = parse('#ffffff')
const textOn = ['bg', 'surface', 'surface2', 'field']
const badges = colorTokens.filter((t) => t.group === 'badges').map((t) => t.key)

function pairs(colors) {
  const c = (key) => parse(colors[key])
  const ground = (key) => over(c(key), c('bg'))
  const list = []
  const add = (label, fg, bg, min) => list.push({ label, value: ratio(fg, bg), min })
  for (const fg of ['heading', 'text', 'text2', 'muted'])
    for (const bg of textOn) add(`${fg} / ${bg}`, c(fg), ground(bg), 4.5)
  for (const bg of ['bg', 'surface', 'surface2']) add(`accent_text / ${bg}`, c('accent_text'), ground(bg), 4.5)
  add('on_accent / accent_strong', c('on_accent'), c('accent_strong'), 4.5)
  for (const tone of ['success', 'warning', 'danger', 'info'])
    for (const bg of ['bg', 'surface']) add(`${tone} / ${bg}`, c(tone), ground(bg), 4.5)
  add('header_text / header_bg', c('header_text'), ground('header_bg'), 4.5)
  add('header_hover / header_bg', c('header_hover'), ground('header_bg'), 4.5)
  add('footer_text / footer_bg', c('footer_text'), ground('footer_bg'), 4.5)
  add('footer_link / footer_bg', c('footer_link'), ground('footer_bg'), 4.5)
  for (const bg of ['bg', 'surface']) add(`accent (odak, ikon) / ${bg}`, c('accent'), ground(bg), 3)
  // Status text on its own tinted background (chips, streaks, claimed days): tone 14% over surface.
  for (const tone of ['success', 'warning', 'danger', 'info'])
    add(`${tone} / ${tone}-soft`, c(tone), over(fade(c(tone), 0.14), ground('surface')), 4.5)
  // Secondary text inside a selected (accent-soft) option.
  add('muted / accent-soft', c('muted'), over(fade(c('accent'), 0.16), ground('surface')), 4.5)
  // Soft accent selection (chips, menu): accent_text on accent 16% over the surface.
  add(
    'accent_text / accent-soft',
    c('accent_text'),
    over(fade(c('accent'), 0.16), ground('surface')),
    4.5
  )
  for (const key of badges) {
    add(`beyaz / ${key} (dolu rozet)`, white, c(key), 4.5)
    const soft = over(fade(c(key), 0.16), ground('surface'))
    add(`${key} yumuşak rozet`, mix(c(key), c('heading'), 0.55), soft, 4.5)
  }
  return list
}

const stock = (light) => Object.fromEntries(colorTokens.map((t) => [t.key, light ? t.light : t.default]))

let errors = 0
let warnings = 0
const report = (title, colors, strict) => {
  const failed = pairs(colors).filter((pair) => pair.value < pair.min)
  if (!quiet || failed.length) console.log(`\n${title}: ${failed.length ? `${failed.length} sorun` : 'tamam'}`)
  for (const pair of quiet ? failed : pairs(colors)) {
    const ok = pair.value >= pair.min
    if (!ok && strict) errors++
    else if (!ok) warnings++
    if (!quiet || !ok)
      console.log(`  ${ok ? '✓' : strict ? '✗' : '!'} ${pair.label.padEnd(36)} ${pair.value.toFixed(2).padStart(5)}:1 (en az ${pair.min})`)
  }
}

report('Koyu şema (varsayılan)', stock(false), true)
report('Açık şema (varsayılan)', stock(true), true)
for (const preset of presets) {
  if (!Object.keys(preset.colors).length) continue
  report(`Hazır set: ${preset.label} (${preset.scheme === 'light' ? 'açık' : 'koyu'})`, { ...stock(preset.scheme === 'light'), ...preset.colors }, false)
}
console.log(`\n${errors} hata, ${warnings} uyarı (hazır setler).`)
process.exit(errors ? 1 : 0)
