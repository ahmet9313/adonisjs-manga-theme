/**
 * Admin form helpers (series and chapter forms, chapter list):
 *
 * - `tagInput`: chip list for short texts (alternative titles, keywords) with optional
 *   suggestions. components/ui/tag_input.edge renders a plain comma separated text field that
 *   works without JavaScript; with it, the same field becomes hidden and carries `tags`.
 * - `tagInput` also takes tags from the `tags-add` window event ({ id, tags }).
 * - `imageDrop`: image drop zone with preview (components/ui/dropzone.edge); also takes a file
 *   from the `image-drop` window event ({ name, file }, sent by cover_finder.js).
 * - `pendingToast`: shows a notice handed over by a script that navigated here (the chapter
 *   upload in chapter_form.js leaves the page with XMLHttpRequest, which uses up the flash).
 *
 * Dynamic text arrives through `data-*` attributes (AGENTS.md rule 9).
 */

const fold = (text) => String(text).trim().toLocaleLowerCase('tr')

/** "1,4 MB" / "820 KB" */
export function fileSize(bytes) {
  if (bytes >= 1024 * 1024)
    return `${(bytes / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function tagInput() {
  return {
    onFill: null,
    tags: [],
    draft: '',
    suggestions: [],
    open: false,
    active: -1,
    announcement: '',
    baseId: 'tags',

    init() {
      // `this.$el` is the component root only here; in bindings it is the bound element.
      this.baseId = this.$el.dataset.id || this.baseId
      let config = {}
      try {
        config = JSON.parse(this.$el.dataset.config || '{}')
      } catch {
        config = {}
      }
      this.suggestions = Array.isArray(config.suggestions) ? config.suggestions.map(String) : []
      for (const tag of Array.isArray(config.tags) ? config.tags : []) this.push(tag)
      // Tags added from elsewhere ("Otomatik doldur", cover_finder.js): { id, tags }.
      this.onFill = (event) => {
        if (event.detail?.id !== this.baseId) return
        const added = (event.detail.tags || []).map((tag) => this.push(tag)).filter(Boolean)
        if (added.length) this.$dispatch('change')
      }
      window.addEventListener('tags-add', this.onFill)
    },

    destroy() {
      window.removeEventListener('tags-add', this.onFill)
    },

    /** Posted value: the controller splits it on commas. */
    get serialized() {
      return this.tags.join(', ')
    },

    get matches() {
      const query = fold(this.draft)
      if (!query) return []
      return this.suggestions
        .filter((item) => !this.has(item) && fold(item).includes(query))
        .slice(0, 8)
    },

    get popular() {
      return this.suggestions.filter((item) => !this.has(item)).slice(0, 8)
    },

    optionId(index) {
      return `${this.baseId}-suggestion-${index}`
    },

    get activeId() {
      return this.open && this.active >= 0 && this.matches[this.active] ? this.optionId(this.active) : ''
    },

    has(tag) {
      const key = fold(tag)
      return this.tags.some((item) => fold(item) === key)
    },

    push(value) {
      const tag = String(value).trim().replace(/\s+/g, ' ')
      // The posted value is comma separated, so a tag with a comma would be split on save.
      if (!tag || tag.includes(',') || this.has(tag)) return ''
      this.tags.push(tag)
      return tag
    },

    /** Adds one or more comma separated values. */
    add(value) {
      const added = String(value).split(',').map((part) => this.push(part)).filter(Boolean)
      this.draft = ''
      this.active = -1
      this.open = false
      if (!added.length) return
      this.announcement = `Eklendi: ${added.join(', ')}`
      this.$dispatch('change')
    },

    remove(index) {
      const [tag] = this.tags.splice(index, 1)
      if (tag) {
        this.announcement = `Kaldırıldı: ${tag}`
        this.$dispatch('change')
      }
      this.$refs.entry?.focus()
    },

    commit() {
      if (this.draft.trim()) this.add(this.draft)
      this.open = false
    },

    onInput() {
      this.open = true
      this.active = -1
    },

    onPaste(event) {
      const text = event.clipboardData?.getData('text') || ''
      if (!/[,\n]/.test(text)) return
      event.preventDefault()
      this.add(text.replace(/\n+/g, ','))
    },

    onKeydown(event) {
      const matches = this.matches
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          if (!matches.length) return
          event.preventDefault()
          this.open = true
          if (event.key === 'ArrowDown') this.active = this.active + 1 >= matches.length ? 0 : this.active + 1
          else this.active = this.active <= 0 ? matches.length - 1 : this.active - 1
          break
        case 'Enter':
        case ',':
          if (!this.draft.trim() && !(this.open && matches[this.active])) return
          event.preventDefault()
          this.add(this.open && matches[this.active] ? matches[this.active] : this.draft)
          break
        case 'Backspace':
          if (this.draft || !this.tags.length) return
          this.remove(this.tags.length - 1)
          break
        case 'Escape':
          if (!this.open) return
          event.preventDefault()
          event.stopPropagation()
          this.open = false
          this.active = -1
          break
      }
    },
  }
}

const imageTypes = ['image/jpeg', 'image/png', 'image/webp']
const imageLimit = 10 * 1024 * 1024

function imageDrop() {
  return {
    preview: '',
    original: '',
    fileName: '',
    fileSize: '',
    error: '',
    over: false,
    objectUrl: '',

    onHandover: null,

    init() {
      this.original = this.$el.dataset.current || ''
      this.preview = this.original
      // A file chosen elsewhere ("Kapak bul", cover_finder.js) for the input of this name.
      this.onHandover = (event) => {
        if (event.detail?.name === this.$refs.file?.name) this.useFile(event.detail.file)
      }
      window.addEventListener('image-drop', this.onHandover)
    },

    destroy() {
      window.removeEventListener('image-drop', this.onHandover)
      this.revoke()
    },

    /** Puts the file into the input (posted with the form) and marks the form as changed. */
    useFile(file) {
      try {
        const transfer = new DataTransfer()
        transfer.items.add(file)
        this.$refs.file.files = transfer.files
      } catch {
        this.error = 'Tarayıcınız bu görseli alana koyamadı; indirip elle seçin.'
        return
      }
      this.$refs.file.dispatchEvent(new Event('change', { bubbles: true }))
    },

    pick(event) {
      this.choose(event.target.files?.[0])
    },

    drop(event) {
      this.over = false
      const file = event.dataTransfer?.files?.[0]
      if (!file) return
      try {
        const transfer = new DataTransfer()
        transfer.items.add(file)
        this.$refs.file.files = transfer.files
      } catch {
        this.error = 'Tarayıcınız sürükle bırakı desteklemiyor; görseli tıklayarak seçin.'
        return
      }
      this.choose(file)
    },

    choose(file) {
      this.error = ''
      if (!file) return this.reset()
      if (!imageTypes.includes(file.type)) {
        this.reset()
        this.error = `${file.name}: yalnız JPG, PNG veya WebP görseli seçin.`
        return
      }
      if (file.size > imageLimit) {
        this.reset()
        this.error = `${file.name}: görsel 10 MB sınırını aşıyor.`
        return
      }
      this.revoke()
      this.objectUrl = URL.createObjectURL(file)
      this.preview = this.objectUrl
      this.fileName = file.name
      this.fileSize = fileSize(file.size)
    },

    /** Forgets the new file; the stored image stays as it is. */
    reset() {
      if (this.$refs.file) this.$refs.file.value = ''
      this.revoke()
      this.preview = this.original
      this.fileName = ''
      this.fileSize = ''
    },

    revoke() {
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = ''
    },
  }
}

export const handoverKey = 'admin:toast'

function pendingToast() {
  return {
    init() {
      let detail = null
      try {
        detail = JSON.parse(window.sessionStorage.getItem(handoverKey) || 'null')
        window.sessionStorage.removeItem(handoverKey)
      } catch {
        detail = null
      }
      if (detail?.text) setTimeout(() => window.dispatchEvent(new CustomEvent('toast', { detail })), 80)
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { tagInput, imageDrop, pendingToast }
