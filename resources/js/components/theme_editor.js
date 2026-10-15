const root = document.documentElement
const hexPattern = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i
const urlPattern = /^(?:\/(?!\/)|https?:\/\/)[^\s"'()\\<>]+$/

/**
 * Admin → Tema → Renkler / Düzen: edits the theme variables and previews them live on this very
 * page (the panel uses the same variables). Colours exist twice (dark `c_*`, light `cl_*`): the
 * segment picks the scheme being edited and previews it by switching `<html data-theme>`.
 * Both sets are always submitted through hidden inputs, so saving one scheme never resets the
 * other. Nothing is stored until the form is submitted.
 */
const themeEditor = () => ({
  mode: 'colors',
  tokens: [],
  groups: {},
  presets: [],
  looks: [],
  stacks: {},
  values: {},
  lightValues: {},
  sets: { dark: {}, light: {} },
  scheme: 'dark',
  lookValues: {},
  notice: '',
  dirty: false,

  init() {
    Object.assign(this, JSON.parse(this.$el.dataset.config || '{}'))
    this.sets = { dark: { ...this.values }, light: { ...this.lightValues } }
    if (this.mode === 'colors') {
      const page = root.dataset.theme
      const light =
        page === 'light' ||
        (page === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)
      this.editScheme(light ? 'light' : 'dark')
    }
    this.looks.forEach((look) => this.applyLook(look.key))
    window.addEventListener('beforeunload', (event) => {
      if (!this.dirty) return
      event.preventDefault()
      event.returnValue = ''
    })
    this.$el.querySelector('form')?.addEventListener('submit', () => (this.dirty = false))
  },

  /* ---- Schemes ---- */
  editScheme(scheme) {
    this.scheme = scheme === 'light' ? 'light' : 'dark'
    // The preview lives in <html style>, which beats both schemes: clear it, then show this one.
    for (const token of this.tokens) root.style.removeProperty(token.css)
    root.dataset.theme = this.scheme
    for (const token of this.tokens) this.applyColor(token.key)
  },
  current() {
    return this.sets[this.scheme]
  },
  presetsOf(scheme) {
    return this.presets.filter((preset) => preset.scheme === scheme)
  },

  /* ---- Colours ---- */
  tokensOf(group) {
    return this.tokens.filter((token) => token.group === group)
  },
  tokenOf(key) {
    return this.tokens.find((token) => token.key === key)
  },
  stock(key, scheme = this.scheme) {
    const token = this.tokenOf(key)
    return scheme === 'light' ? token.light : token.default
  },
  value(key) {
    return this.current()[key] || ''
  },
  isDefault(key, scheme = this.scheme) {
    return (this.sets[scheme][key] || '').toLowerCase() === this.stock(key, scheme).toLowerCase()
  },
  changedCount(scheme) {
    return this.tokens.filter((token) => !this.isDefault(token.key, scheme)).length
  },
  picker(key) {
    const value = this.value(key)
    return hexPattern.test(value) ? value.slice(0, 7) : '#000000'
  },
  setPicker(key, color) {
    const value = this.value(key)
    const alpha = value.length === 9 ? value.slice(7) : ''
    this.setColor(key, color + alpha)
  },
  alpha(key) {
    const value = this.value(key)
    return value.length === 9 ? Math.round((parseInt(value.slice(7), 16) / 255) * 100) : 100
  },
  setAlpha(key, percent) {
    const hex = Math.round((Number(percent) / 100) * 255)
      .toString(16)
      .padStart(2, '0')
    this.setColor(key, this.picker(key) + (hex === 'ff' ? '' : hex))
  },
  setColor(key, value) {
    this.current()[key] = value
    this.dirty = true
    this.applyColor(key)
  },
  resetColor(key) {
    this.setColor(key, this.stock(key))
  },
  /** Always writes the value (also the stock one): removing it would reveal the saved theme. */
  applyColor(key) {
    const token = this.tokenOf(key)
    const value = this.value(key)
    if (hexPattern.test(value)) root.style.setProperty(token.css, value)
  },
  applyPreset(preset) {
    if (preset.scheme !== this.scheme) this.editScheme(preset.scheme)
    for (const token of this.tokens)
      this.setColor(token.key, preset.colors[token.key] || this.stock(token.key))
    this.notice = `"${preset.label}" uygulandı. Kalıcı olması için Kaydet'e basın.`
  },

  /* ---- Looks ---- */
  lookOf(key) {
    return this.looks.find((look) => look.key === key)
  },
  setLook(key, value) {
    this.lookValues[key] = value
    this.dirty = true
    this.applyLook(key)
  },
  /** Like colours, the stock value is written explicitly so the preview never shows the saved one. */
  applyLook(key) {
    const look = this.lookOf(key)
    if (!look) return
    const value = this.lookValues[key]
    if (look.type === 'url') {
      root.style.setProperty('--t-img', urlPattern.test(value || '') ? `url("${value}")` : 'none')
      return
    }
    if (!look.css) return
    let css = null
    if (look.type === 'range') css = `${value}${look.unit}`
    else if (look.key === 'font') css = this.stacks[value] || this.stacks.sans || null
    else if (look.type === 'select') css = value
    if (css !== null) root.style.setProperty(look.css, css)
  },
})

export default themeEditor

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { themeEditor }
