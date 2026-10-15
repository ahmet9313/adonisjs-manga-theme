const frames = {
  avatar: { w: 280, h: 280, outW: 512, outH: 512, label: 'Profil resmi' },
  banner: { w: 450, h: 150, outW: 1500, outH: 500, label: 'Banner' },
}
const maxSourceBytes = 12 * 1024 * 1024
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

/** Settings page: live profile card plus a Discord-style crop dialog for avatar and banner uploads. */
export default () => ({
  csrf: '',
  avatar: null,
  banner: null,
  name: '',
  username: '',
  bio: '',
  tab: 'profile',
  message: '',
  failed: false,
  dragging: false,
  frame: frames.avatar,
  view: { nw: 1, nh: 1, scale: 1, min: 1, zoom: 1, x: 0, y: 0 },
  editor: { open: false, kind: 'avatar', src: '', busy: false, error: '' },
  drag: null,

  init() {
    Object.assign(this, JSON.parse(this.$el.dataset.config || '{}'))
    const hash = location.hash.slice(1)
    if (['profile', 'account', 'security'].includes(hash)) this.tab = hash
  },

  pick(kind) {
    this.editor.kind = kind
    this.$refs.file.value = ''
    this.$refs.file.click()
  },

  chosen(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!allowedTypes.includes(file.type))
      return this.notify('Yalnızca JPG, PNG veya WebP seçebilirsin.', true)
    if (file.size > maxSourceBytes) return this.notify('Görsel en fazla 12 MB olabilir.', true)
    const src = URL.createObjectURL(file)
    const probe = new Image()
    probe.onload = () => {
      const base = frames[this.editor.kind]
      const width = Math.min(base.w, window.innerWidth - 96)
      this.frame = { ...base, w: width, h: Math.round((width * base.h) / base.w) }
      this.view.nw = probe.naturalWidth
      this.view.nh = probe.naturalHeight
      this.view.min = Math.max(
        this.frame.w / probe.naturalWidth,
        this.frame.h / probe.naturalHeight
      )
      this.view.zoom = 1
      this.view.scale = this.view.min
      this.view.x = (this.frame.w - probe.naturalWidth * this.view.scale) / 2
      this.view.y = (this.frame.h - probe.naturalHeight * this.view.scale) / 2
      this.editor.src = src
      this.editor.error = ''
      this.editor.busy = false
      this.editor.open = true
    }
    probe.onerror = () => {
      URL.revokeObjectURL(src)
      this.notify('Görsel okunamadı.', true)
    }
    probe.src = src
  },

  clamp() {
    const v = this.view
    v.x = Math.min(0, Math.max(this.frame.w - v.nw * v.scale, v.x))
    v.y = Math.min(0, Math.max(this.frame.h - v.nh * v.scale, v.y))
  },

  zoom(next) {
    const v = this.view
    const cx = (this.frame.w / 2 - v.x) / v.scale
    const cy = (this.frame.h / 2 - v.y) / v.scale
    if (typeof next === 'number') v.zoom = Math.min(4, Math.max(1, next))
    v.scale = v.min * v.zoom
    v.x = this.frame.w / 2 - cx * v.scale
    v.y = this.frame.h / 2 - cy * v.scale
    this.clamp()
  },

  wheel(event) {
    this.zoom(this.view.zoom * (event.deltaY < 0 ? 1.08 : 0.92))
  },

  dragStart(event) {
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
    if (this.editor.src) URL.revokeObjectURL(this.editor.src)
    this.editor.src = ''
  },

  async apply() {
    const { kind } = this.editor
    const frame = this.frame
    const v = this.view
    const canvas = document.createElement('canvas')
    canvas.width = frame.outW
    canvas.height = frame.outH
    canvas
      .getContext('2d')
      .drawImage(
        this.$refs.img,
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
      this.editor.error = 'Görsel işlenemedi. Başka bir görsel deneyin.'
      return
    }
    const form = new FormData()
    form.append(kind, blob, `${kind}.${blob.type === 'image/webp' ? 'webp' : 'png'}`)
    this.editor.busy = true
    this.editor.error = ''
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
      this.editor.error = 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.'
    }
  },

  async remove(kind) {
    try {
      const response = await fetch(`/ayarlar/${kind}/sil`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': this.csrf, 'accept': 'application/json' },
      })
      if (!response.ok) throw new Error()
      this.changed(kind, null)
      this.notify(`${frames[kind].label} kaldırıldı.`)
    } catch {
      this.notify('İşlem başarısız oldu.', true)
    }
  },

  /** Keeps the preview card and the navbar menu in sync without a reload. */
  changed(kind, url) {
    this[kind] = url
    if (kind === 'avatar') {
      for (const holder of document.querySelectorAll('[data-user-avatar]')) {
        const img = holder.querySelector('[data-avatar-img]')
        const fallback = holder.querySelector('[data-avatar-fallback]')
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
    this.message = text
    this.failed = failed
    clearTimeout(this.timer)
    this.timer = setTimeout(() => (this.message = ''), 5000)
  },
})
