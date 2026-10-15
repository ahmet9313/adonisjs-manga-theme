const root = document.documentElement
const hexPattern = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i
const urlPattern = /^(?:\/(?!\/)|https?:\/\/)[^\s"'()\\<>]+$/
const accentAttrs = { accent: 'data-accent', accent2: 'data-accent2' }

/**
 * Admin → Tema → Renkler / Düzen: edits the theme variables and previews them live on this very
 * page (the panel uses the same variables). Nothing is stored until the form is submitted.
 */
export default () => ({
  mode: 'colors',
  tokens: [],
  groups: {},
  presets: [],
  looks: [],
  stacks: {},
  values: {},
  lookValues: {},
  tab: 'bg',
  notice: '',

  init() {
    Object.assign(this, JSON.parse(this.$el.dataset.config || '{}'))
    if (this.mode === 'colors') this.tokens.forEach((token) => this.applyColor(token.key))
    this.looks.forEach((look) => this.applyLook(look.key))
  },

  /* ---- Colours ---- */
  tokensOf(group) {
    return this.tokens.filter((token) => token.group === group)
  },
  tokenOf(key) {
    return this.tokens.find((token) => token.key === key)
  },
  isDefault(key) {
    return (this.values[key] || '').toLowerCase() === this.tokenOf(key).default.toLowerCase()
  },
  picker(key) {
    const value = this.values[key] || ''
    return hexPattern.test(value) ? value.slice(0, 7) : '#000000'
  },
  setPicker(key, color) {
    const alpha = (this.values[key] || '').length === 9 ? this.values[key].slice(7) : ''
    this.setColor(key, color + alpha)
  },
  alpha(key) {
    const value = this.values[key] || ''
    return value.length === 9 ? Math.round((parseInt(value.slice(7), 16) / 255) * 100) : 100
  },
  setAlpha(key, percent) {
    const hex = Math.round((Number(percent) / 100) * 255)
      .toString(16)
      .padStart(2, '0')
    this.setColor(key, this.picker(key) + (hex === 'ff' ? '' : hex))
  },
  setColor(key, value) {
    this.values[key] = value
    this.applyColor(key)
  },
  resetColor(key) {
    this.setColor(key, this.tokenOf(key).default)
  },
  applyColor(key) {
    const token = this.tokenOf(key)
    const value = this.values[key]
    if (!hexPattern.test(value || '') || this.isDefault(key)) {
      root.style.removeProperty(token.css)
      if (accentAttrs[key]) root.removeAttribute(accentAttrs[key])
      return
    }
    root.style.setProperty(token.css, value)
    if (accentAttrs[key]) root.setAttribute(accentAttrs[key], '')
  },
  applyPreset(preset) {
    for (const token of this.tokens) this.setColor(token.key, preset.colors[token.key] || token.default)
    if (this.lookValues) {
      this.lookValues.scheme = (preset.looks && preset.looks.scheme) || 'dark'
      this.applyLook('scheme')
    }
    this.notice = `"${preset.label}" uygulandı. Kalıcı olması için Kaydet'e basın.`
  },

  /* ---- Looks ---- */
  lookOf(key) {
    return this.looks.find((look) => look.key === key)
  },
  setLook(key, value) {
    this.lookValues[key] = value
    this.applyLook(key)
  },
  applyLook(key) {
    const look = this.lookOf(key)
    if (!look) return
    const value = this.lookValues[key]
    let css = null
    if (look.type === 'range') css = `${value}${look.unit}`
    else if (look.key === 'font') css = this.stacks[value] || null
    else if (look.type === 'select') css = value
    else if (look.type === 'url') css = urlPattern.test(value || '') ? `url("${value}")` : null
    const name = look.type === 'url' ? '--t-img' : look.css
    if (css === null || String(value) === String(look.default)) root.style.removeProperty(name)
    else root.style.setProperty(name, css)
  },
})
