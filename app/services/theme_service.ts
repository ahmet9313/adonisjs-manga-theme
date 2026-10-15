import {
  colorTokens,
  derivedAccents,
  flags,
  fontStacks,
  looks,
  type ColorToken,
  type Flag,
} from '#config/theme'
import { invalidField } from '#services/upload_service'

/** Storage keys in the `settings` table. */
export const colorKey = (key: string) => `c.${key}`
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

/** The compiled theme: one stylesheet, the <html> attributes it needs and the switches. */
class ThemeService {
  css = ''
  attrs = ''
  private switches = new Map<string, boolean>()

  apply(get: (key: string) => string) {
    const vars: string[] = []
    const attrs: string[] = []

    for (const token of colorTokens) {
      const value = get(colorKey(token.key))
      if (!value || !hexPattern.test(value)) continue
      vars.push(`${token.css}:${value}`)
      if (derivedAccents[token.key]) attrs.push(derivedAccents[token.key])
    }

    for (const look of looks) {
      const value = get(lookKey(look.key))
      if (!value) continue
      if (look.type === 'range') {
        const number = Number(value)
        if (Number.isFinite(number)) vars.push(`${look.css}:${number}${look.unit}`)
      } else if (look.type === 'select') {
        if (!look.choices.some((choice) => choice.value === value)) continue
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
      vars.push('--t-glow-1:transparent;--t-glow-2:transparent;--t-glow-3:transparent')
    if (!this.flag('bg_dots')) vars.push('--t-dots:transparent')
    if (!this.flag('bg_fixed')) vars.push('--t-img-attach:scroll')

    const rules: string[] = []
    if (vars.length) rules.push(`:root{${vars.join(';')}}`)
    if (!this.flag('header_sticky')) rules.push('.site-header{position:static!important}')
    if (!this.flag('animations'))
      rules.push(
        '*,::before,::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}'
      )
    const custom = get(CUSTOM_CSS_KEY)
    if (custom) rules.push(custom)

    this.css = rules.join('\n')
    this.attrs = attrs.map((name) => ` ${name}`).join('')
  }

  flag(key: string) {
    return this.switches.get(key) ?? flags.find((flag) => flag.key === key)?.default ?? true
  }

  /* ---- Reading form input ------------------------------------------------------------ */

  /** `c_<key>` fields → storage entries. Empty means "stock value". */
  readColors(body: Record<string, unknown>, tokens: ColorToken[] = colorTokens) {
    const entries: Record<string, string> = {}
    for (const token of tokens) {
      const raw = String(body[`c_${token.key}`] ?? '').trim()
      if (!raw) {
        entries[colorKey(token.key)] = ''
        continue
      }
      const color = normalizeColor(raw)
      if (!color)
        invalidField(`c_${token.key}`, `${token.label}: geçerli bir renk girin (#rrggbb).`)
      entries[colorKey(token.key)] = stored(color, token.default)
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
