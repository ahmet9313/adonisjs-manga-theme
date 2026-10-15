/**
 * Roles page (pages/admin/roles/index.edge): keeps the preview badge in step with the name and
 * colour inputs, offers ready colours and a reset to the role's defaults. Values arrive through
 * data-label, data-color, data-default-label and data-default-color (AGENTS.md rule 9).
 */
const hex = /^#[0-9a-f]{6}$/i

/** Ready colours: the stock role colours first, then tones readable in both schemes. */
const swatches = [
  '#fca5a5',
  '#fcd34d',
  '#6ee7b7',
  '#93c5fd',
  '#c4b5fd',
  '#f9a8d4',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
]

const roleEditor = () => ({
  label: '',
  color: '#ffffff',
  defaults: { label: '', color: '' },
  swatches,

  init() {
    const data = this.$el.dataset
    this.label = data.label || ''
    this.color = data.color || '#ffffff'
    this.defaults = {
      label: data.defaultLabel || '',
      color: (data.defaultColor || '').toLowerCase(),
    }
  },

  get validColor() {
    return hex.test(this.color)
  },

  /** Shown while the hex field holds an unfinished value. */
  get fallback() {
    return hex.test(this.defaults.color) ? this.defaults.color : '#888888'
  },

  get badgeStyle() {
    const color = this.validColor ? this.color.toLowerCase() : this.fallback
    return `color:${color};border-color:${color}66;background-color:${color}26`
  },

  get isDefault() {
    return this.label === this.defaults.label && this.color.toLowerCase() === this.defaults.color
  },

  isPicked(swatch) {
    return this.validColor && this.color.toLowerCase() === swatch
  },

  /** Hex field, colour picker and swatches edit the same value. */
  pick(value) {
    this.color = String(value).toLowerCase()
  },

  reset() {
    this.label = this.defaults.label
    this.color = this.defaults.color
  },
})

export default roleEditor

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { roleEditor }
