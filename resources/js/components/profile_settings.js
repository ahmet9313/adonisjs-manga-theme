import { toast } from './shared.js'

const frames = {
  avatar: { w: 280, h: 280, outW: 512, outH: 512, label: 'Profil resmi' },
  banner: { w: 450, h: 150, outW: 1500, outH: 500, label: 'Kapak görseli' },
}
const maxSourceBytes = 12 * 1024 * 1024
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
/** Section tabs; the URL hash (#profile, #account, #security) selects one. */
const tabs = ['profile', 'account', 'security']
/** The settings forms redirect to /ayarlar, so the open tab is remembered across the submit. */
const tabMemory = 'settings-tab'
/** Arrow keys move the image this many pixels (Shift: four times as far). */
const nudge = 10
const zoomStep = 1.12
const maxZoom = 4

/**
 * Settings page (/ayarlar): section tabs, a live profile card, and the crop dialog for avatar
 * and cover uploads (drag, wheel, slider, arrow keys and + / −). Feedback uses the layout toasts.
 */
const profileSettings = () => ({
  csrf: '',
  avatar: null,
  banner: null,
  name: '',
  username: '',
  bio: '',
  tab: 'profile',
  errors: false,
  vertical: false,
  removing: '',
  dragging: false,
  frame: frames.avatar,
  view: { nw: 1, nh: 1, scale: 1, min: 1, zoom: 1, x: 0, y: 0 },
  editor: { open: false, kind: 'avatar', src: '', busy: false, error: '' },
  drag: null,

  init() {
    Object.assign(this, JSON.parse(this.$el.dataset.config || '{}'))
    let remembered = null
    try {
      remembered = window.sessionStorage.getItem(tabMemory)
      window.sessionStorage.removeItem(tabMemory)
    } catch {
      /* Storage may be disabled by the browser. */
    }
    const hash = location.hash.slice(1)
    // A failed form opens its own tab (decided on the server); otherwise the hash or the tab
    // that was open before a successful save.
    if (tabs.includes(hash)) this.tab = hash
    else if (!this.errors && tabs.includes(remembered)) this.tab = remembered
    window.addEventListener('hashchange', () => {
      const key = location.hash.slice(1)
      if (tabs.includes(key)) this.tab = key
    })
    // Vertical tab list from the lg breakpoint (resources/css/pages/account.css).
    const wide = window.matchMedia('(min-width: 1024px)')
    this.vertical = wide.matches
    wide.addEventListener?.('change', (event) => (this.vertical = event.matches))
  },

  /* ---- Tabs ----------------------------------------------------------------------------- */
  select(key, focus = false) {
    if (!tabs.includes(key)) return
    this.tab = key
    try {
      history.replaceState(history.state, '', `#${key}`)
    } catch {
      /* Sandboxed documents may refuse history changes. */
    }
    if (focus) this.$nextTick(() => document.getElementById(`settings-tab-${key}`)?.focus())
  },

  /** Arrow keys (both orientations), Home and End move between the tabs. */
  onTabKey(event) {
    const index = tabs.indexOf(event.target?.dataset?.tab)
    if (index === -1) return
    const target = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: tabs.length - 1,
    }[event.key]
    if (target === undefined) return
    event.preventDefault()
    this.select(tabs[(target + tabs.length) % tabs.length], true)
  },

  rememberTab() {
    try {
      window.sessionStorage.setItem(tabMemory, this.tab)
    } catch {
      /* Not essential. */
    }
  },

  /* ---- Image upload and crop dialog ------------------------------------------------------ */
  pick(kind) {
    this.editor.kind = kind
    this.$refs.file.value = ''
    this.$refs.file.click()
  },

  chosen(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!allowedTypes.includes(file.type))
      return this.notify('Yalnızca JPG, PNG veya WebP görsel seçebilirsin.', true)
    if (file.size > maxSourceBytes) return this.notify('Görsel en fazla 12 MB olabilir.', true)
    const src = URL.createObjectURL(file)
    const probe = new Image()
    probe.onload = () => {
      const base = frames[this.editor.kind]
      // The dialog is a full-width sheet on phones and at most 34rem wide elsewhere.
      const room =
        window.innerWidth < 640 ? window.innerWidth - 48 : Math.min(500, window.innerWidth - 96)
      const width = Math.min(base.w, room)
      this.frame = { ...base, w: width, h: Math.round((width * base.h) / base.w) }
      this.view.nw = probe.naturalWidth
      this.view.nh = probe.naturalHeight
      this.view.min = Math.max(
        this.frame.w / probe.naturalWidth,
        this.frame.h / probe.naturalHeight
      )
      this.reset()
      this.editor.src = src
      this.editor.error = ''
      this.editor.busy = false
      this.editor.open = true
    }
    probe.onerror = () => {
      URL.revokeObjectURL(src)
      this.notify('Görsel okunamadı. Başka bir dosya dene.', true)
    }
    probe.src = src
  },

  /** Fits the whole frame and centres the image. */
  reset() {
    const v = this.view
    v.zoom = 1
    v.scale = v.min
    v.x = (this.frame.w - v.nw * v.scale) / 2
    v.y = (this.frame.h - v.nh * v.scale) / 2
  },

  clamp() {
    const v = this.view
    v.x = Math.min(0, Math.max(this.frame.w - v.nw * v.scale, v.x))
    v.y = Math.min(0, Math.max(this.frame.h - v.nh * v.scale, v.y))
  },

  /** Zooms around the centre of the frame (1 = the image just covers the frame). */
  zoom(next) {
    const v = this.view
    const cx = (this.frame.w / 2 - v.x) / v.scale
    const cy = (this.frame.h / 2 - v.y) / v.scale
    if (typeof next === 'number' && Number.isFinite(next))
      v.zoom = Math.min(maxZoom, Math.max(1, next))
    v.scale = v.min * v.zoom
    v.x = this.frame.w / 2 - cx * v.scale
    v.y = this.frame.h / 2 - cy * v.scale
    this.clamp()
  },

  zoomIn() {
    this.zoom(this.view.zoom * zoomStep)
  },

  zoomOut() {
    this.zoom(this.view.zoom / zoomStep)
  },

  wheel(event) {
    this.zoom(this.view.zoom * (event.deltaY < 0 ? 1.08 : 0.92))
  },

  /** Keyboard control of the crop area: arrows move the image, + and − zoom, 0 resets. */
  onCropKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const step = event.shiftKey ? nudge * 4 : nudge
    const move = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key]
    if (move) {
      this.view.x += move[0]
      this.view.y += move[1]
      this.clamp()
    } else if (['+', '='].includes(event.key)) this.zoomIn()
    else if (['-', '_', '−'].includes(event.key)) this.zoomOut()
    else if (event.key === '0') this.reset()
    else return
    event.preventDefault()
  },

  dragStart(event) {
    if (event.button !== 0) return
    this.dragging = true
    this.drag = { px: event.clientX, py: event.clientY, x: this.view.x, y: this.view.y }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  },

  dragMove(event) {
    if (!this.drag) return
    this.view.x = this.drag.x + (event.clientX - this.drag.px)
    this.view.y = this.drag.y + (event.clientY - this.drag.py)
    this.clamp()
  },

  dragEnd() {
    this.dragging = false
    this.drag = null
  },

  closeEditor() {
    if (this.editor.busy) return
    this.editor.open = false
    this.dragEnd()
    if (this.editor.src) URL.revokeObjectURL(this.editor.src)
    this.editor.src = ''
  },

  async apply() {
    if (this.editor.busy) return
    const { kind } = this.editor
    const frame = this.frame
    const v = this.view
    const image = this.$refs.img
    this.editor.busy = true
    this.editor.error = ''
    // Clicking right after the dialog opened must not draw a half-decoded image.
    await image.decode?.().catch(() => {})
    const canvas = document.createElement('canvas')
    canvas.width = frame.outW
    canvas.height = frame.outH
    canvas
      .getContext('2d')
      .drawImage(
        image,
        -v.x / v.scale,
        -v.y / v.scale,
        frame.w / v.scale,
        frame.h / v.scale,
        0,
        0,
        frame.outW,
        frame.outH
      )
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
    if (!blob) {
      this.editor.busy = false
      this.editor.error = 'Görsel işlenemedi. Başka bir görsel dene.'
      return
    }
    const form = new FormData()
    form.append(kind, blob, `${kind}.${blob.type === 'image/webp' ? 'webp' : 'png'}`)
    try {
      const response = await fetch(`/ayarlar/${kind}`, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
        headers: { 'x-csrf-token': this.csrf, 'accept': 'application/json' },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        this.editor.error = data.error || data.errors?.[0]?.message || 'Yükleme başarısız oldu.'
        this.editor.busy = false
        return
      }
      this.editor.busy = false
      this.closeEditor()
      this.changed(kind, data[kind])
      this.notify(`${frames[kind].label} güncellendi.`)
    } catch {
      this.editor.busy = false
      this.editor.error = 'Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.'
    }
  },

  async remove(kind) {
    if (this.removing) return
    this.removing = kind
    try {
      const response = await fetch(`/ayarlar/${kind}/sil`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': this.csrf, 'accept': 'application/json' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      this.changed(kind, null)
      this.notify(`${frames[kind].label} kaldırıldı.`)
    } catch {
      this.notify('İşlem tamamlanamadı. Lütfen tekrar dene.', true)
    }
    this.removing = ''
  },

  /** Keeps the profile card and the header avatar in sync without a reload. */
  changed(kind, url) {
    this[kind] = url
    if (kind === 'avatar') {
      for (const holder of document.querySelectorAll('[data-user-avatar]')) {
        const img = holder.querySelector('[data-avatar-img]')
        const fallback = holder.querySelector('[data-avatar-fallback]')
        if (!img || !fallback) continue
        if (url) img.src = url
        img.classList.toggle('hidden', !url)
        fallback.classList.toggle('hidden', !!url)
      }
    } else {
      for (const img of document.querySelectorAll('[data-user-banner]')) {
        if (url) img.src = url
        img.classList.toggle('hidden', !url)
      }
    }
  },

  notify(text, failed = false) {
    toast(text, failed ? 'error' : 'success')
  },
})

export default profileSettings

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { profileSettings }
