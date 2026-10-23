import { csrfToken } from './library.js'
import { toast } from './shared.js'

/**
 * Admin → Toplu Yükle (pages/admin/bulk_upload.edge). Steps: pick → uploading → preview →
 * importing → done. The archive goes up with XMLHttpRequest for the progress bar; the server
 * answers with the chapters it found (`chapters`, `existing` numbers, `suggestedNumber` for a
 * flat archive) and keeps the file until the import or "Vazgeç" (`token`).
 */
const sizeText = (bytes) => {
  const value = Number(bytes) || 0
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
  return `${Math.max(1, Math.round(value / 1024)).toLocaleString('tr-TR')} KB`
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'x-csrf-token': csrfToken(),
    },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(data.message || data.errors?.[0]?.message || `İşlem tamamlanamadı (HTTP ${response.status}).`)
  return data
}

function bulkUpload() {
  let request = null
  return {
    step: 'pick',
    seriesId: '',
    maxZipBytes: 0,
    file: null,
    dragging: false,
    progress: 0,
    loaded: 0,
    error: '',
    announcement: '',
    preview: null,
    rows: [],
    mode: 'publish',
    conflict: 'skip',
    bump: true,
    notify: true,
    result: null,
    sizeText,

    init() {
      const config = JSON.parse(this.$el.dataset.config || '{}')
      this.seriesId = config.seriesId ? String(config.seriesId) : ''
      this.maxZipBytes = Number(config.maxZipBytes) || 0
      this.guard = (event) => {
        event.preventDefault()
        event.returnValue = ''
      }
    },

    get progressText() {
      if (this.progress >= 100) return 'Arşiv inceleniyor…'
      return `${sizeText(this.loaded)} / ${sizeText(this.file?.size)} · %${this.progress}`
    },

    choose(file) {
      this.error = ''
      if (!file) return
      if (!/\.zip$/i.test(file.name)) {
        this.error = 'Dosya .zip uzantılı olmalı.'
        return
      }
      if (this.maxZipBytes && file.size > this.maxZipBytes) {
        this.error = `ZIP dosyası en fazla ${sizeText(this.maxZipBytes)} olabilir (${sizeText(file.size)}).`
        return
      }
      this.file = file
    },

    upload() {
      if (!this.file || !this.seriesId || this.step === 'uploading') return
      this.error = ''
      this.step = 'uploading'
      this.progress = 0
      this.loaded = 0
      this.announcement = `${this.file.name} yükleniyor.`
      request = new XMLHttpRequest()
      request.open('POST', `/admin/toplu-yukle/arsiv?series_id=${encodeURIComponent(this.seriesId)}`)
      request.setRequestHeader('Accept', 'application/json')
      request.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
      request.setRequestHeader('X-CSRF-TOKEN', csrfToken())
      request.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) return
        this.loaded = event.loaded
        this.progress = Math.min(100, Math.round((event.loaded / event.total) * 100))
      })
      request.addEventListener('load', () => {
        window.removeEventListener('beforeunload', this.guard)
        let data = {}
        try {
          data = JSON.parse(request.responseText)
        } catch {
          data = {}
        }
        request = null
        if (data.token && Array.isArray(data.chapters)) return this.showPreview(data)
        this.step = 'pick'
        this.error = data.message || data.errors?.[0]?.message || 'Arşiv yüklenemedi; tekrar deneyin.'
      })
      request.addEventListener('error', () => {
        window.removeEventListener('beforeunload', this.guard)
        request = null
        this.step = 'pick'
        this.error = 'Bağlantı kesildi; arşiv yüklenmedi. Tekrar deneyin.'
      })
      request.addEventListener('abort', () => {
        window.removeEventListener('beforeunload', this.guard)
        request = null
        this.step = 'pick'
        toast('Yükleme iptal edildi.', 'info')
      })
      window.addEventListener('beforeunload', this.guard)
      const body = new FormData()
      body.append('zip', this.file)
      request.send(body)
    },

    abort() {
      request?.abort()
    },

    showPreview(data) {
      const existing = new Set(data.existing)
      this.preview = { ...data, existing }
      this.rows = data.chapters.map((chapter) => ({
        ...chapter,
        number: chapter.number ?? (data.flat ? data.suggestedNumber : ''),
        title: chapter.title || '',
        include: chapter.importable,
      }))
      this.mode = 'publish'
      this.conflict = 'skip'
      this.step = 'preview'
      this.announcement = `${data.chapters.length} bölüm bulundu.`
      this.$nextTick(() => this.$refs.previewTitle?.focus())
    },

    validNumber(row) {
      return Number.isInteger(row.number) && row.number >= 0 && row.number <= 1000000
    },

    exists(row) {
      return Boolean(this.preview?.existing.has(row.number))
    },

    duplicated(row) {
      return this.rows.filter((other) => other.include && other.number === row.number).length > 1
    },

    get chosen() {
      return this.rows.filter((row) => row.include)
    },

    get conflictCount() {
      return this.rows.filter((row) => this.validNumber(row) && this.exists(row)).length
    },

    get canImport() {
      const chosen = this.chosen
      return (
        chosen.length > 0 &&
        chosen.every((row) => this.validNumber(row) && !this.duplicated(row))
      )
    },

    get importLabel() {
      const count = this.chosen.filter((row) => !(this.exists(row) && this.conflict === 'skip')).length
      return count ? `${count} bölümü içe aktar` : 'İçe aktar'
    },

    get summaryText() {
      const chosen = this.chosen
      const skipped = chosen.filter((row) => this.exists(row) && this.conflict === 'skip').length
      const pages = chosen.reduce((total, row) => total + row.pageCount, 0)
      return `${chosen.length} bölüm seçili · ${pages.toLocaleString('tr-TR')} sayfa${skipped ? ` · ${skipped} atlanacak` : ''}`
    },

    async importChapters() {
      if (!this.canImport || this.step === 'importing') return
      this.error = ''
      this.step = 'importing'
      this.announcement = 'Bölümler içe aktarılıyor.'
      window.addEventListener('beforeunload', this.guard)
      try {
        this.result = await postJson('/admin/toplu-yukle/ice-aktar', {
          token: this.preview.token,
          series_id: Number(this.seriesId),
          mode: this.mode,
          conflict: this.conflict,
          bump: this.bump,
          notify: this.notify,
          chapters: this.chosen.map((row) => ({ key: row.key, number: row.number, title: row.title })),
        })
        this.preview = null
        this.rows = []
        this.step = 'done'
        this.announcement = 'Toplu yükleme tamamlandı.'
        this.$nextTick(() => this.$refs.resultTitle?.focus())
      } catch (error) {
        this.step = 'preview'
        this.error = error.message
      } finally {
        window.removeEventListener('beforeunload', this.guard)
      }
    },

    async cancel() {
      const token = this.preview?.token
      this.reset()
      if (token) await postJson('/admin/toplu-yukle/iptal', { token }).catch(() => {})
    },

    reset() {
      this.step = 'pick'
      this.preview = null
      this.rows = []
      this.result = null
      this.file = null
      this.error = ''
      this.progress = 0
      if (this.$refs.file) this.$refs.file.value = ''
    },
  }
}

export const components = { bulkUpload }
