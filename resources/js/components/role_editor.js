/** Roles page: keeps the preview badge in step with the name and colour inputs. */
export default () => ({
  label: '',
  color: '#ffffff',

  init() {
    this.label = this.$el.dataset.label || ''
    this.color = this.$el.dataset.color || '#ffffff'
  },

  get validColor() {
    return /^#[0-9a-f]{6}$/i.test(this.color)
  },

  get badgeStyle() {
    const color = this.validColor ? this.color : '#ffffff'
    return `color:${color};border-color:${color}66;background-color:${color}26`
  },

  /** Hex field and colour picker edit the same value. */
  pick(value) {
    this.color = value
  },
})
