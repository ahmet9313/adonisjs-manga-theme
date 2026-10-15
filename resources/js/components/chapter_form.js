import { fileSize, handoverKey } from './tag_input.js'

const accepted = ['image/jpeg', 'image/png', 'image/webp']
const maxBytes = 10 * 1024 * 1024
const maxPages = 500

/**
 * Admin chapter form (pages/admin/chapters/form.edge), loaded on demand by app.js.
 *
 * Hooks kept for the template: x-data="chapterForm", `data-form` (JSON: seriesId, contentTypes,
 * series, pages), x-ref="chapterFormEl", @submit="prepareSubmit($event)", $refs.pagesInput
 * (input name="pages"), hidden `series_id` and `page_order` (JSON list of existing URLs and
 * '__new__' placeholders in display order).
 *
 * - Series combobox: type to filter, ArrowUp/ArrowDown/Home/End move, Enter picks, Escape closes.
 * - Pages: drag and drop, or the move/remove buttons on every page; refused files are listed.
 * - New pages are uploaded with XMLHttpRequest so the save bar can show the progress; the server
 *   answers 422 JSON on validation errors (shown above the form, files are kept) and redirects
 *   to the chapter list on success. Everything else (novel text, reordering only) submits normally.
 */
export default function chapterForm() {
  return {
    seriesId: '',
    contentType: '',
    searchQuery: '',
    dropdownOpen: false,
    selectedSeriesName: '',
    typing: false,
    activeIndex: -1,
    seriesError: '',
    allSeries: [],
    seriesContentTypes: {},

    // Unified page list: { id, type: 'existing'|'new', url?, file?, preview, name, size? }
    allPages: [],
    rejected: [],
    imageDragging: false,
    dragStartIndex: null,
    dragOverIndex: null,
    nextId: 0,
    announcement: '',
    words: 0,

    // Upload state
    uploading: false,
    phase: '',
    progress: 0,
    loaded: 0,
    total: 0,
    errors: [],
    request: null,

    get selectedSeries() {
      return this.allSeries.find((s) => String(s.id) === String(this.seriesId)) || null
    },

    get filteredSeries() {
      const query = this.typing ? this.searchQuery.trim().toLocaleLowerCase('tr') : ''
      if (!query) return this.allSeries
      return this.allSeries.filter((s) => s.title.toLocaleLowerCase('tr').includes(query))
    },

    get activeOptionId() {
      const s = this.filteredSeries[this.activeIndex]
      return this.dropdownOpen && s ? `series-option-${s.id}` : ''
    },

    get newCount() {
      return this.allPages.filter((p) => p.type === 'new').length
    },

    get newBytes() {
      return this.allPages.reduce((sum, p) => sum + (p.type === 'new' ? p.size || 0 : 0), 0)
    },

    get progressText() {
      if (this.phase === 'processing') return 'Sayfalar sunucuda kaydediliyor…'
      if (this.phase === 'done') return 'Kaydedildi, bölüm listesine dönülüyor…'
      if (!this.total) return 'Yükleme başlıyor…'
      return `%${this.progress} · ${fileSize(this.loaded)} / ${fileSize(this.total)}`
    },

    // ---- Series combobox ----------------------------------------------------------------
    openList() {
      if (this.dropdownOpen) return
      this.dropdownOpen = true
      const index = this.filteredSeries.findIndex((s) => String(s.id) === String(this.seriesId))
      this.activeIndex = Math.max(0, index)
      this.revealOption()
    },

    closeList() {
      this.dropdownOpen = false
      this.typing = false
      this.activeIndex = -1
      this.searchQuery = this.selectedSeries ? this.selectedSeries.title : ''
    },

    onSeriesInput() {
      this.typing = true
      this.dropdownOpen = true
      this.activeIndex = 0
    },

    revealOption() {
      this.$nextTick(() => {
        const id = this.activeOptionId
        if (id) document.getElementById(id)?.scrollIntoView({ block: 'nearest' })
      })
    },

    onSeriesKeydown(event) {
      const list = this.filteredSeries
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          event.preventDefault()
          if (!this.dropdownOpen) return this.openList()
          if (!list.length) return
          this.activeIndex =
            event.key === 'ArrowDown'
              ? (this.activeIndex + 1) % list.length
              : (this.activeIndex - 1 + list.length) % list.length
          this.revealOption()
          break
        case 'Home':
        case 'End':
          if (!this.dropdownOpen || !list.length) return
          event.preventDefault()
          this.activeIndex = event.key === 'Home' ? 0 : list.length - 1
          this.revealOption()
          break
        case 'Enter':
          if (!this.dropdownOpen) return
          event.preventDefault()
          if (list[this.activeIndex]) this.selectSeries(list[this.activeIndex])
          break
        case 'Escape':
          if (!this.dropdownOpen) return
          event.preventDefault()
          event.stopPropagation()
          this.closeList()
          break
        case 'Tab':
          if (this.dropdownOpen) this.closeList()
          break
      }
    },

    selectSeries(s) {
      this.seriesId = s.id
      this.selectedSeriesName = s.title + ' (' + s.typeName + ')'
      this.searchQuery = s.title
      this.typing = false
      this.dropdownOpen = false
      this.activeIndex = -1
      this.seriesError = ''
      this.contentType = this.seriesContentTypes[this.seriesId] || ''
      this.announcement = `Seri seçildi: ${s.title}, ${s.typeName}.`
    },

    // ---- Pages ----------------------------------------------------------------------------
    handleFileSelect(event) {
      this.addFiles(event.target.files)
      // Reset input so same files can be re-selected
      event.target.value = ''
    },

    addFiles(fileList) {
      const refused = []
      let added = 0
      for (const file of fileList) {
        let reason = ''
        if (!accepted.includes(file.type)) reason = 'JPG, PNG veya WebP değil'
        else if (file.size > maxBytes) reason = `10 MB sınırını aşıyor (${fileSize(file.size)})`
        else if (this.allPages.length >= maxPages) reason = `en fazla ${maxPages} sayfa eklenebilir`
        if (reason) {
          refused.push({ name: file.name, reason })
          continue
        }
        this.allPages.push({
          id: this.nextId++,
          type: 'new',
          file,
          name: file.name,
          size: file.size,
          preview: URL.createObjectURL(file),
        })
        added++
      }
      this.rejected = refused
      if (added || refused.length)
        this.announcement = [
          added ? `${added} sayfa eklendi.` : '',
          refused.length ? `${refused.length} dosya eklenmedi.` : '',
        ]
          .filter(Boolean)
          .join(' ')
    },

    removePage(index) {
      const [page] = this.allPages.splice(index, 1)
      if (!page) return
      if (page.type === 'new' && page.preview) URL.revokeObjectURL(page.preview)
      this.announcement = `Sayfa ${index + 1} kaldırıldı. ${this.allPages.length} sayfa kaldı.`
      this.$nextTick(() => {
        const next = this.allPages[Math.min(index, this.allPages.length - 1)]
        const target = next
          ? document.querySelector(`[data-page-id="${next.id}"] [data-tool="remove"]`)
          : this.$refs.pagesInput
        target?.focus()
      })
    },

    movePage(index, step) {
      const target = index + step
      if (target < 0 || target >= this.allPages.length) return
      const [page] = this.allPages.splice(index, 1)
      this.allPages.splice(target, 0, page)
      this.announcement = `Sayfa ${index + 1}, ${target + 1}. sıraya taşındı.`
      this.$nextTick(() => {
        const card = document.querySelector(`[data-page-id="${page.id}"]`)
        const button = card?.querySelector(`[data-tool="${step < 0 ? 'up' : 'down'}"]`)
        ;(button && !button.disabled ? button : card?.querySelector('[data-tool="remove"]'))?.focus()
      })
    },

    dragStart(index, event) {
      this.dragStartIndex = index
      event.dataTransfer.effectAllowed = 'move'
      // Firefox needs some data to start a drag.
      event.dataTransfer.setData('text/plain', String(index))
    },

    reorderPages(targetIndex) {
      if (this.dragStartIndex === null || this.dragStartIndex === targetIndex) {
        this.dragStartIndex = null
        this.dragOverIndex = null
        return
      }
      const item = this.allPages.splice(this.dragStartIndex, 1)[0]
      this.allPages.splice(targetIndex, 0, item)
      this.announcement = `Sayfa ${this.dragStartIndex + 1}, ${targetIndex + 1}. sıraya taşındı.`
      this.dragStartIndex = null
      this.dragOverIndex = null
    },

    /** Files dropped on the page list (not a reorder) are added like the drop zone does. */
    dropOnList(event) {
      if (this.dragStartIndex === null && event.dataTransfer?.files?.length)
        this.addFiles(event.dataTransfer.files)
    },

    getPageOrderJSON() {
      return JSON.stringify(this.allPages.map((p) => (p.type === 'existing' ? p.url : '__new__')))
    },

    countWords(text) {
      this.words = String(text || '').trim() ? String(text).trim().split(/\s+/).length : 0
    },

    // ---- Submit ---------------------------------------------------------------------------
    prepareSubmit(event) {
      this.errors = []
      if (this.uploading) {
        event.preventDefault()
        return
      }
      if (!this.seriesId) {
        event.preventDefault()
        this.seriesError = 'Bölümün ekleneceği seriyi seçin.'
        this.$nextTick(() => this.$refs.seriesInput?.focus())
        return
      }
      const isNovel = this.contentType === 'novel'
      if (!isNovel && this.allPages.length === 0) {
        event.preventDefault()
        this.showErrors(['En az bir sayfa görseli ekleyin.'])
        return
      }
      // Set new files on the file input via DataTransfer
      const newPages = isNovel ? [] : this.allPages.filter((p) => p.type === 'new')
      if (newPages.length > 0) {
        const dt = new DataTransfer()
        newPages.forEach((p) => dt.items.add(p.file))
        this.$refs.pagesInput.files = dt.files
      } else {
        // Clear file input if no new files
        this.$refs.pagesInput.value = ''
      }
      // page_order is bound with :value, but Alpine updates it a tick later: write it now so a
      // submit right after a reorder or a drop never sends a stale order.
      const order = event.target.querySelector('input[name="page_order"]')
      if (order) order.value = this.getPageOrderJSON()
      // Without new files the form submits natively.
      if (!newPages.length || typeof XMLHttpRequest === 'undefined') return
      event.preventDefault()
      this.upload(event.target)
    },

    upload(form) {
      const request = new XMLHttpRequest()
      this.request = request
      this.uploading = true
      this.phase = 'upload'
      this.progress = 0
      this.loaded = 0
      this.total = 0
      request.open('POST', form.action)
      request.setRequestHeader('Accept', 'application/json')
      request.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
      const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
      if (token) request.setRequestHeader('X-CSRF-TOKEN', token)
      request.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) return
        this.loaded = event.loaded
        this.total = event.total
        this.progress = Math.min(100, Math.round((event.loaded / event.total) * 100))
      })
      request.upload.addEventListener('load', () => {
        this.progress = 100
        this.phase = 'processing'
      })
      request.addEventListener('load', () => this.finish(request, form))
      request.addEventListener('error', () =>
        this.fail(['Bağlantı kesildi; bölüm kaydedilmedi. Bağlantınızı kontrol edip tekrar deneyin.'])
      )
      request.addEventListener('abort', () => {
        this.fail([])
        window.dispatchEvent(
          new CustomEvent('toast', { detail: { text: 'Yükleme iptal edildi.', tone: 'info' } })
        )
      })
      window.addEventListener('beforeunload', this.guard)
      request.send(new FormData(form))
    },

    cancelUpload() {
      this.request?.abort()
    },

    finish(request, form) {
      window.removeEventListener('beforeunload', this.guard)
      const target = request.responseURL ? new URL(request.responseURL, window.location.href) : null
      const formPath = new URL(form.action, window.location.href).pathname
      if (request.status >= 200 && request.status < 300 && target && target.pathname !== formPath) {
        this.phase = 'done'
        // The redirect was followed by XMLHttpRequest, so its flash message is shown here instead.
        const notice = new DOMParser()
          .parseFromString(request.responseText, 'text/html')
          .querySelector('[data-server-toast] .toast__text')
          ?.textContent?.trim()
        try {
          window.sessionStorage.setItem(
            handoverKey,
            JSON.stringify({ text: notice || 'Bölüm kaydedildi', tone: 'success' })
          )
        } catch {}
        window.location.assign(target.href)
        return
      }
      let data = {}
      try {
        data = JSON.parse(request.responseText)
      } catch {
        data = {}
      }
      const messages = Array.isArray(data.errors)
        ? data.errors.map((error) => error.message || error.title).filter(Boolean)
        : []
      if (messages.length) return this.fail(messages)
      if (request.status === 413)
        return this.fail(['Yükleme çok büyük. Sayfaları birkaç kayıtta ekleyin.'])
      this.fail([
        data.message ||
          `Bölüm kaydedilemedi (HTTP ${request.status}). Sayfayı yenileyip tekrar deneyin.`,
      ])
    },

    fail(messages) {
      window.removeEventListener('beforeunload', this.guard)
      this.uploading = false
      this.phase = ''
      this.progress = 0
      this.request = null
      if (messages.length) this.showErrors(messages)
    },

    showErrors(messages) {
      this.errors = messages
      this.$nextTick(() => {
        const box = this.$refs.errorBox
        box?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        box?.focus({ preventScroll: true })
      })
    },

    /** Keeps the progress bar of components/ui/progress in step with `progress`. */
    paintProgress(value) {
      const track = this.$refs.progress?.querySelector('[role="progressbar"]')
      if (!track) return
      track.setAttribute('aria-valuenow', String(value))
      const bar = track.querySelector('.progress__bar')
      if (bar) bar.style.width = `${value}%`
    },

    init() {
      const data = JSON.parse(this.$el.dataset.form)
      this.seriesId = data.seriesId
      this.allSeries = data.series
      this.seriesContentTypes = data.contentTypes
      this.guard = (event) => {
        event.preventDefault()
        event.returnValue = ''
      }
      const existingPagesData = data.pages
      // Load existing pages into the unified list
      existingPagesData.forEach((url) => {
        this.allPages.push({
          id: this.nextId++,
          type: 'existing',
          url: url,
          preview: url,
          name: url.split('/').pop(),
        })
      })

      if (this.seriesId) {
        const found = this.allSeries.find((s) => s.id == this.seriesId)
        if (found) {
          this.selectedSeriesName = found.title + ' (' + found.typeName + ')'
          this.searchQuery = found.title
        }
        this.contentType = this.seriesContentTypes[this.seriesId] || ''
      }
      this.countWords(this.$el.querySelector('[name="text_content"]')?.value)
    },

    destroy() {
      window.removeEventListener('beforeunload', this.guard)
      for (const page of this.allPages)
        if (page.type === 'new' && page.preview) URL.revokeObjectURL(page.preview)
    },
  }
}
