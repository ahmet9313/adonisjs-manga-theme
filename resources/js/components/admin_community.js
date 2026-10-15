/**
 * Admin → Topluluk forms (pages/admin/cosmetics/form.edge, pages/admin/cards/form.edge).
 *
 * - `cosmeticForm`: keeps the live preview, the enabled inputs (kind, look mode, preset per kind,
 *   gradient colours, unlock rule) and the image picker of the cosmetic form in step.
 * - `cardForm`: live card preview (image, rarity, name) and the image picker of the card form.
 *
 * The forms post plain fields; these components never submit anything themselves. The initial
 * state comes from `data-config` (JSON written by the server) and every visible text lives in the
 * templates (AGENTS.md rule 9): scripts only expose state and short error codes.
 */

const imageTypes = ['image/png', 'image/webp', 'image/gif', 'image/jpeg']
const imageLimit = 6 * 1024 * 1024

/** Class prefix of a preset per cosmetic kind (see cosmetic_service.visual). */
const presetPrefix = { effect: 'fx fx-', frame: 'frame-', wallpaper: 'wall-' }
/** Look modes a kind accepts (the controller's style_mode rules). */
const kindModes = {
  sticker: ['image'],
  effect: ['preset', 'gradient'],
  frame: ['preset', 'image'],
  wallpaper: ['preset', 'image'],
}

function readConfig(el) {
  try {
    return JSON.parse(el.dataset.config || '{}') || {}
  } catch {
    return {}
  }
}

/** "1,4 MB" / "820 KB" */
function fileSize(bytes) {
  if (bytes >= 1024 * 1024)
    return `${(bytes / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Merges objects keeping their getters (a spread would evaluate them once). */
function compose(...parts) {
  const target = {}
  for (const part of parts) Object.defineProperties(target, Object.getOwnPropertyDescriptors(part))
  return target
}

/**
 * Image picker shared by both forms: `<input type="file" x-ref="file">` inside a drop zone.
 * `stored` is the saved image, `chosen` the object URL of a newly picked file. `fileError` is a
 * code ('type' | 'size' | 'drop'); the template shows the matching message.
 */
function imagePicker() {
  return {
    stored: '',
    chosen: '',
    fileName: '',
    fileSize: '',
    fileError: '',
    over: false,

    get imageUrl() {
      return this.chosen || this.stored
    },

    pickFile(event) {
      this.chooseFile(event.target.files?.[0])
    },

    dropFile(event) {
      this.over = false
      const file = event.dataTransfer?.files?.[0]
      if (!file) return
      try {
        const transfer = new DataTransfer()
        transfer.items.add(file)
        this.$refs.file.files = transfer.files
      } catch {
        this.fileError = 'drop'
        return
      }
      this.chooseFile(file)
    },

    chooseFile(file) {
      this.fileError = ''
      if (!file) return this.resetFile()
      if (!imageTypes.includes(file.type)) {
        this.resetFile()
        this.fileError = 'type'
        return
      }
      if (file.size > imageLimit) {
        this.resetFile()
        this.fileError = 'size'
        return
      }
      this.revoke()
      this.chosen = URL.createObjectURL(file)
      this.fileName = file.name
      this.fileSize = fileSize(file.size)
      this.dirty = true
    },

    /** Forgets the new file; the stored image stays as it is. */
    resetFile() {
      if (this.$refs.file) this.$refs.file.value = ''
      this.revoke()
      this.fileName = ''
      this.fileSize = ''
    },

    revoke() {
      if (this.chosen) URL.revokeObjectURL(this.chosen)
      this.chosen = ''
    },

    destroy() {
      this.revoke()
    },
  }
}

function cosmeticForm() {
  return compose(imagePicker(), {
    kind: 'effect',
    mode: 'preset',
    presets: { effect: '', frame: '', wallpaper: '' },
    colors: ['#34d399', '#22d3ee', '#a855f7'],
    third: true,
    rule: 'level',
    level: '1',
    badge: '',
    name: '',
    active: true,
    featured: false,
    dirty: false,

    init() {
      const config = readConfig(this.$el)
      if (kindModes[config.kind]) this.kind = config.kind
      if (typeof config.mode === 'string') this.mode = config.mode
      this.presets = { ...this.presets, ...(config.presets || {}) }
      if (Array.isArray(config.colors) && config.colors.length === 3)
        this.colors = [...config.colors]
      this.third = config.third !== false
      if (['level', 'badge', 'gift'].includes(config.rule)) this.rule = config.rule
      this.level = String(config.level ?? '1')
      this.badge = config.badge || ''
      this.name = config.name || ''
      this.active = config.active !== false
      this.featured = config.featured === true
      this.stored = config.image || ''
      this.fitMode()
      this.$watch('kind', () => this.fitMode())
    },

    /** Whether the current kind accepts a look mode. */
    allowed(mode) {
      return (kindModes[this.kind] || []).includes(mode)
    },

    /** A kind change keeps the mode when it still applies (stickers are always images). */
    fitMode() {
      if (!this.allowed(this.mode)) this.mode = this.kind === 'sticker' ? 'image' : 'preset'
    },

    get usesImage() {
      return this.kind === 'sticker' || this.mode === 'image'
    },

    /** Saving without an image look deletes the uploaded image (controller behaviour). */
    get dropsImage() {
      return Boolean(this.stored) && !this.usesImage
    },

    get presetKey() {
      return this.presets[this.kind] || ''
    },

    get colorList() {
      return this.third ? this.colors : this.colors.slice(0, 2)
    },

    get gradient() {
      return `linear-gradient(90deg, ${this.colorList.join(', ')})`
    },

    get effectClass() {
      if (this.mode === 'gradient') return 'fx fx-custom'
      return this.presetKey ? presetPrefix.effect + this.presetKey : ''
    },

    get effectStyle() {
      return this.mode === 'gradient' ? `--fx: ${this.gradient}` : ''
    },

    get frameClass() {
      return this.mode === 'preset' && this.presetKey ? presetPrefix.frame + this.presetKey : ''
    },

    get frameImage() {
      return this.mode === 'image' ? this.imageUrl : ''
    },

    get wallClass() {
      return this.mode === 'preset' && this.presetKey ? presetPrefix.wallpaper + this.presetKey : ''
    },

    get wallStyle() {
      return this.mode === 'image' && this.imageUrl
        ? `background-image: url("${encodeURI(this.imageUrl)}")`
        : ''
    },

    /** Name of the chosen badge, read from the option the server rendered. */
    get badgeName() {
      const select = this.$refs.badge
      const option = select ? [...select.options].find((item) => item.value === this.badge) : null
      return option ? option.textContent.trim() : ''
    },
  })
}

function cardForm() {
  return compose(imagePicker(), {
    name: '',
    rarity: 'F',
    seriesId: '',
    covers: {},
    dirty: false,

    init() {
      const config = readConfig(this.$el)
      this.name = config.name || ''
      this.rarity = config.rarity || 'F'
      this.seriesId = config.seriesId ? String(config.seriesId) : ''
      this.covers = config.covers || {}
      this.stored = config.image || ''
    },

    get cover() {
      return this.covers[this.seriesId] || ''
    },

    /** What the saved card will show: a new file, the stored image, else the series cover. */
    get previewImage() {
      return this.chosen || this.stored || this.cover
    },

    get source() {
      if (this.chosen) return 'file'
      if (this.stored) return 'stored'
      return this.cover ? 'cover' : 'none'
    },
  })
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { cosmeticForm, cardForm }
