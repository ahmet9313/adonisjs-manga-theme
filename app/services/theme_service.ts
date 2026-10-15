import {
  colorTokens,
  derivedAccents,
  flags,
  fontStacks,
  isScheme,
  looks,
  type ColorToken,
  type Flag,
  type Scheme,
} from '#config/theme'
import { invalidField } from '#services/upload_service'

/** Storage keys in the `settings` table. Dark colours are `c.*`, light colours `cl.*`. */
export const colorKey = (key: string) => `c.${key}`
export const lightColorKey = (key: string) => `cl.${key}`
export const lookKey = (key: string) => `l.${key}`
export const flagKey = (key: string) => `f.${key}`
export const CUSTOM_CSS_KEY = 'x.css'
const customCssLimit = 20000

const hexPattern = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/
const urlPattern = /^(?:\/(?!\/)|https?:\/\/)[^\s"'()\\<>]+$/

/** Accepts `#rgb`, `#rrggbb` and `#rrggbbaa`; returns lowercase `#rrggbb[aa]` or null. */
export function normalizeColor(value: string): string | null {
  let hex = value.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(hex)) hex = '#' + [...hex.slice(1)].map((char) => char + char).join('')
  return hexPattern.test(hex) ? hex : null
}

/** A value equal to the stock one is not stored, so defaults can change with the code. */
const stored = (value: string, fallback: string) => (value === fallback ? '' : value)

/** Stock value of a colour token in one scheme. */
export const stockColor = (item: ColorToken, light = false) => (light ? item.light : item.default)

/**
 * The compiled theme: one stylesheet with the overrides of both colour schemes, the <html>
 * attributes it needs, the default scheme and the switches. Stock values live in tokens.css.
 */
class ThemeService {
  css = ''
  attrs = ''
  /** Scheme shown to visitors who did not pick one (Admin → Tema → Renkler). */
  scheme: Scheme = 'dark'
  /** Effective header background of each scheme, for <meta name="theme-color">. */
  headerColors = { dark: '#0e0e11', light: '#f7f6f3' }
  private switches = new Map<string, boolean>()

  apply(get: (key: string) => string) {
    const dark: string[] = []
    const light: string[] = []
    const vars: string[] = []
    const forced: string[] = []
    const attrs = new Set<string>()

    for (const item of colorTokens) {
      for (const [list, value] of [
        [dark, get(colorKey(item.key))],
        [light, get(lightColorKey(item.key))],
      ] as const) {
        if (!value || !hexPattern.test(value)) continue
        list.push(`${item.css}:${value}`)
        if (derivedAccents[item.key]) attrs.add(derivedAccents[item.key])
      }
    }
    const header = colorTokens.find((item) => item.key === 'header_bg')!
    const headerOf = (value: string, fallback: string) =>
      (hexPattern.test(value) ? value : fallback).slice(0, 7)
    this.headerColors = {
      dark: headerOf(get(colorKey('header_bg')), header.default),
      light: headerOf(get(lightColorKey('header_bg')), header.light),
    }

    this.scheme = 'dark'
    for (const look of looks) {
      const value = get(lookKey(look.key))
      if (look.key === 'default_scheme') {
        if (isScheme(value)) this.scheme = value
        continue
      }
      if (!value) continue
      if (look.type === 'range') {
        const number = Number(value)
        if (Number.isFinite(number)) vars.push(`${look.css}:${number}${look.unit}`)
      } else if (look.type === 'select') {
        if (!look.css || !look.choices.some((choice) => choice.value === value)) continue
        if (look.key === 'font') vars.push(`${look.css}:${fontStacks[value] ?? ''}`)
        else vars.push(`${look.css}:${value}`)
      } else if (urlPattern.test(value)) {
        vars.push(`--t-img:url("${value}")`)
      }
    }

    this.switches = new Map(
      flags.map((flag) => {
        const value = get(flagKey(flag.key))
        return [flag.key, value ? value === '1' : flag.default]
      })
    )
    if (!this.flag('bg_glow'))
      forced.push('--t-glow-1:transparent;--t-glow-2:transparent;--t-glow-3:transparent')
    if (!this.flag('bg_dots')) forced.push('--t-dots:transparent')
    if (!this.flag('bg_fixed')) forced.push('--t-img-attach:scroll')

    // `:root` overrides the dark stock values; the light block of tokens.css is more specific,
    // so dark overrides never leak into the light scheme and vice versa.
    const rules: string[] = []
    if (dark.length || vars.length) rules.push(`:root{${[...dark, ...vars].join(';')}}`)
    if (light.length) {
      const block = light.join(';')
      rules.push(
        `:root[data-theme="light"]{${block}}`,
        `@media (prefers-color-scheme: light){:root[data-theme="system"]{${block}}}`
      )
    }
    // Switches win in both schemes.
    if (forced.length) rules.push(`:root,:root[data-theme]{${forced.join(';')}}`)
    if (!this.flag('header_sticky')) rules.push('.site-header{position:static!important}')
    if (!this.flag('animations'))
      rules.push(
        '*,::before,::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}'
      )
    const custom = get(CUSTOM_CSS_KEY)
    if (custom) rules.push(custom)

    this.css = rules.join('\n')
    this.attrs = [...attrs].map((name) => ` ${name}`).join('')
  }

  flag(key: string) {
    return this.switches.get(key) ?? flags.find((flag) => flag.key === key)?.default ?? true
  }

  /** The scheme of a request: the visitor's `theme` cookie when allowed, else the default. */
  schemeFor(choice: unknown): Scheme {
    return this.flag('scheme_switch') && isScheme(choice) ? choice : this.scheme
  }

  /** `<meta name="theme-color">` tags for a scheme (two media-bound tags for "system"). */
  themeColorMeta(scheme: Scheme) {
    const tag = (color: string, media = '') =>
      `<meta name="theme-color" content="${color}"${media ? ` media="${media}"` : ''}>`
    if (scheme === 'system')
      return (
        tag(this.headerColors.dark, '(prefers-color-scheme: dark)') +
        tag(this.headerColors.light, '(prefers-color-scheme: light)')
      )
    return tag(this.headerColors[scheme])
  }

  /* ---- Reading form input ------------------------------------------------------------ */

  /**
   * `c_<key>` (dark) or `cl_<key>` (light) fields → storage entries. Empty means "stock value",
   * and so does a value equal to the stock one.
   */
  readColors(body: Record<string, unknown>, options: { light?: boolean } = {}) {
    const light = options.light === true
    const prefix = light ? 'cl_' : 'c_'
    const keyOf = light ? lightColorKey : colorKey
    const entries: Record<string, string> = {}
    for (const item of colorTokens) {
      const field = prefix + item.key
      const raw = String(body[field] ?? '').trim()
      if (!raw) {
        entries[keyOf(item.key)] = ''
        continue
      }
      const color = normalizeColor(raw)
      if (!color)
        invalidField(
          field,
          `${item.label} (${light ? 'açık' : 'koyu'} şema): geçerli bir renk girin (#rrggbb).`
        )
      entries[keyOf(item.key)] = stored(color, stockColor(item, light))
    }
    return entries
  }

  /** `l_<key>` fields → storage entries. */
  readLooks(body: Record<string, unknown>, only?: string[]) {
    const entries: Record<string, string> = {}
    for (const look of looks) {
      if (only && !only.includes(look.key)) continue
      const raw = String(body[`l_${look.key}`] ?? '').trim()
      const field = `l_${look.key}`
      if (look.type === 'range') {
        if (!raw) {
          entries[lookKey(look.key)] = ''
          continue
        }
        const number = Number(raw)
        if (!Number.isFinite(number) || number < look.min || number > look.max)
          invalidField(field, `${look.label}: ${look.min} ile ${look.max} arasında olmalı.`)
        entries[lookKey(look.key)] = stored(String(number), String(look.default))
      } else if (look.type === 'select') {
        if (raw && !look.choices.some((choice) => choice.value === raw))
          invalidField(field, `${look.label}: geçersiz seçim.`)
        entries[lookKey(look.key)] = stored(raw, look.default)
      } else {
        if (raw && !urlPattern.test(raw))
          invalidField(
            field,
            `${look.label}: /yol veya http(s):// adresi girin (boşluk ve tırnak olmadan).`
          )
        entries[lookKey(look.key)] = raw
      }
    }
    return entries
  }

  /** `f_<key>` checkboxes of the listed flags. A missing box means "off". */
  readFlags(body: Record<string, unknown>, group: Flag[] = flags) {
    const entries: Record<string, string> = {}
    for (const flag of group) {
      const on = body[`f_${flag.key}`] === 'on'
      entries[flagKey(flag.key)] = on === flag.default ? '' : on ? '1' : '0'
    }
    return entries
  }

  readCss(value: unknown) {
    const css = String(value ?? '').trim()
    if (css.length > customCssLimit)
      invalidField('custom_css', 'Özel CSS en fazla 20.000 karakter olabilir.')
    if (/<\/?\s*style|<\s*script/i.test(css))
      invalidField('custom_css', 'Özel CSS HTML etiketi içeremez.')
    return { [CUSTOM_CSS_KEY]: css }
  }
}

export default new ThemeService()
