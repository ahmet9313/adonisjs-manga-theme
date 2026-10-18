/**
 * `brandImage`: upload area next to an image address field on the theme pages
 * (components/ui/brand_image.edge). Choosing or dropping a file uploads it at once to
 * POST /admin/tema/gorsel (fields `image`, `kind`; header X-CSRF-TOKEN) and writes the returned
 * address into the field named by `data-target`, firing `input` so live previews follow. Typing an
 * address keeps working; "Kaldır" empties the field. Nothing is stored until the form is saved.
 *
 * Data attributes: target (input id), kind (logo | logo_mobile | favicon | background),
 * accept (comma separated extensions), max (bytes). Messages are Turkish and fixed here.
 */
import { fileSize } from './tag_input.js'

function brandImage() {
  let request = null

  return {
    url: '',
    broken: false,
    over: false,
    uploading: false,
    progress: 0,
    error: '',
    input: null,

    init() {
      this.input = document.getElementById(this.$el.dataset.target || '')
      if (!this.input) return
      this.url = this.input.value.trim()
      this.input.addEventListener('input', () => {
        this.url = this.input.value.trim()
        this.broken = false
      })
    },

    destroy() {
      request?.abort()
    },

    get extensions() {
      return (this.$root.dataset.accept || '').split(',').filter(Boolean)
    },

    pick(event) {
      this.upload(event.target.files?.[0])
      event.target.value = ''
    },

    drop(event) {
      this.over = false
      this.upload(event.dataTransfer?.files?.[0])
    },

    upload(file) {
      if (!file || this.uploading) return
      this.error = ''
      const extension = (file.name.split('.').pop() || '').toLowerCase()
      if (!this.extensions.includes(extension)) {
        this.error = `Bu dosya türü desteklenmiyor. İzin verilenler: ${this.extensions
          .filter((ext) => ext !== 'jpeg')
          .map((ext) => ext.toUpperCase())
          .join(', ')}.`
        return
      }
      const max = Number(this.$root.dataset.max) || 0
      if (max && file.size > max) {
        this.error = `Dosya çok büyük (${fileSize(file.size)}); en fazla ${fileSize(max)}.`
        return
      }
      const body = new FormData()
      body.append('kind', this.$root.dataset.kind || '')
      body.append('image', file)
      request = new XMLHttpRequest()
      request.open('POST', '/admin/tema/gorsel')
      request.responseType = 'json'
      request.setRequestHeader('Accept', 'application/json')
      const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
      if (token) request.setRequestHeader('X-CSRF-TOKEN', token)
      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) this.progress = Math.round((event.loaded / event.total) * 100)
      })
      request.addEventListener('load', () => {
        const data = request.response || {}
        if (request.status === 200 && typeof data.url === 'string') this.set(data.url)
        else this.error = data.error || data.message || 'Görsel yüklenemedi.'
        this.finish()
      })
      request.addEventListener('error', () => {
        this.error = 'Bağlantı kesildi; görsel yüklenemedi.'
        this.finish()
      })
      request.addEventListener('abort', () => this.finish())
      this.uploading = true
      this.progress = 0
      request.send(body)
    },

    cancel() {
      request?.abort()
    },

    finish() {
      this.uploading = false
      request = null
    },

    set(value) {
      if (!this.input) return
      this.input.value = value
      this.input.dispatchEvent(new Event('input', { bubbles: true }))
    },

    clear() {
      this.error = ''
      this.set('')
    },
  }
}

export const components = { brandImage }
