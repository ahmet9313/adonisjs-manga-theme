import { fileSize, handoverKey } from './tag_input.js'

const accepted = ['image/jpeg', 'image/png', 'image/webp']
const maxBytes = 10 * 1024 * 1024
const maxPages = 500

/** "1,2 GB" for large videos, else fileSize(). */
const videoSize = (bytes) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} GB`
    : fileSize(bytes)

/** Form rows use 'local' and 'link'; stored sources are 'local', 'embed' or 'file'. */
const rowKind = (kind) => (kind === 'local' ? 'local' : 'link')

/**
 * Admin chapter form (pages/admin/chapters/form.edge), loaded on demand by app.js.
 *
 * Hooks kept for the template: x-data="chapterForm", `data-form` (JSON: seriesId, formats,
 * series, pages), x-ref="chapterFormEl", @submit="prepareSubmit($event)", $refs.pagesInput
 * (input name="pages"), hidden `series_id` and `page_order` (JSON list of existing URLs and
 * '__new__' placeholders in display order).
 *
 * - Series combobox: type to filter, ArrowUp/ArrowDown/Home/End move, Enter picks, Escape closes.
 * - Pages: drag and drop, or the move/remove buttons on every page; refused files are listed.
 * - New pages are uploaded with XMLHttpRequest so the save bar can show the progress; the server
 *   answers 422 JSON on validation errors (shown above the form, files are kept) and redirects
 *   to the chapter list on success. Everything else (text chapters, reordering only) submits normally.
 * - The series' content format (`data-form.formats`, id → image/text/video, chosen per content
 *   type under Admin → İçerik Türleri) picks the editor: pages, a text area or video sources.
 * - Video series: the source editor replaces the pages. Each row is
 *   { kind: 'local'|'link', url, host, label }; a 'local' row uploads its video at once
 *   (POST /admin/bolumler/video?series_id=…, field `video`, header X-CSRF-TOKEN) and keeps the
 *   returned URL. The rows are posted as JSON in the hidden `sources` field; the form submits
 *   normally and is blocked while a video is still uploading.
 */
export default function chapterForm() {
  /** Running video uploads by row id (kept outside Alpine's reactive state). */
  const videoRequests = new Map()

  return {
    seriesId: '',
    format: '',
    searchQuery: '',
    dropdownOpen: false,
    selectedSeriesName: '',
    typing: false,
    activeIndex: -1,
    seriesError: '',
    allSeries: [],
    seriesFormats: {},

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

    // Video sources
    localHost: '',
    maxVideoBytes: 0,
    videoExtensions: [],
    sources: [],

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

    get isVideo() {
      return this.format === 'video'
    },

    get videoUploading() {
      return this.sources.some((row) => row.upload.state === 'uploading')
    },

    get sourceBadge() {
      return `${this.sources.length} kaynak`
    },

    get sourcesSummary() {
      if (!this.sources.length) return 'Kaynak eklenmedi'
      const running = this.sources.filter((row) => row.upload.state === 'uploading').length
      const base = `${this.sources.length} kaynak`
      return running ? `${base} · ${running} video yükleniyor` : base
    },

    get localKindLabel() {
      return this.localHost ? `${this.localHost} (video yükle)` : 'Video yükle'
    },

    get videoAccept() {
      return this.videoExtensions.map((extension) => `.${extension}`).join(',')
    },

    get videoHint() {
      const formats = this.videoExtensions.map((extension) => extension.toUpperCase()).join(', ')
      const limit = this.maxVideoBytes ? ` · en fazla ${videoSize(this.maxVideoBytes)}` : ''
      return `${formats}${limit}`
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
      this.format = this.seriesFormats[this.seriesId] || ''
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
        ;(button && !button.disabled
          ? button
          : card?.querySelector('[data-tool="remove"]')
        )?.focus()
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

    // ---- Video sources -------------------------------------------------------------------
    makeRow(data = {}) {
      return {
        id: this.nextId++,
        kind: rowKind(data.kind),
        // Kept apart, so switching the kind back and forth loses neither.
        link: data.kind !== 'local' && typeof data.url === 'string' ? data.url : '',
        video: data.kind === 'local' && typeof data.url === 'string' ? data.url : '',
        host: data.kind === 'local' || typeof data.host !== 'string' ? '' : data.host,
        label: typeof data.label === 'string' ? data.label : '',
        error: '',
        over: false,
        upload: {
          state: data.kind === 'local' && data.url ? 'done' : 'idle',
          progress: 0,
          loaded: 0,
          total: 0,
          name: data.kind === 'local' && data.url ? 'Kayıtlı video' : '',
          size: 0,
          /** File name of a stored video (its address), shown under "Kayıtlı video". */
          stored: data.kind === 'local' && data.url ? String(data.url).split('/').pop() : '',
          // Series the video was uploaded to on this page (stored videos are checked by the server).
          seriesId: null,
        },
      }
    },

    rowTitle(row, index) {
      const where = row.kind === 'local' ? this.localHost || 'Video' : row.host.trim() || 'Bağlantı'
      return `Kaynak ${index + 1} · ${where}`
    },

    rowAction(index, action) {
      const verb = { up: 'yukarı taşı', down: 'aşağı taşı', remove: 'kaldır' }[action]
      return `Kaynak ${index + 1}: ${verb}`
    },

    addSource() {
      const previous = this.sources[this.sources.length - 1]
      const row = this.makeRow({ kind: previous ? previous.kind : 'link' })
      this.sources.push(row)
      this.announcement = `Kaynak ${this.sources.length} eklendi.`
      this.$nextTick(() => {
        document
          .getElementById(row.kind === 'local' ? `source-file-${row.id}` : `source-url-${row.id}`)
          ?.focus()
      })
    },

    removeSource(index) {
      const [row] = this.sources.splice(index, 1)
      if (!row) return
      videoRequests.get(row.id)?.abort()
      this.announcement = `Kaynak ${index + 1} kaldırıldı. ${this.sources.length} kaynak kaldı.`
      this.$nextTick(() => {
        const next = this.sources[Math.min(index, this.sources.length - 1)]
        const target = next
          ? document.querySelector(`[data-source-id="${next.id}"] [data-tool="remove"]`)
          : this.$refs.addSourceButton
        target?.focus()
      })
    },

    moveSource(index, step) {
      const target = index + step
      if (target < 0 || target >= this.sources.length) return
      const [row] = this.sources.splice(index, 1)
      this.sources.splice(target, 0, row)
      this.announcement = `Kaynak ${index + 1}, ${target + 1}. sıraya taşındı.`
      this.$nextTick(() => {
        const card = document.querySelector(`[data-source-id="${row.id}"]`)
        const button = card?.querySelector(`[data-tool="${step < 0 ? 'up' : 'down'}"]`)
        ;(button && !button.disabled
          ? button
          : card?.querySelector('[data-tool="remove"]')
        )?.focus()
      })
    },

    setKind(row, kind) {
      if (row.kind === kind || row.upload.state === 'uploading') return
      row.kind = kind
      row.error = ''
    },

    fileMeta(row) {
      const size = row.upload.size ? videoSize(row.upload.size) : ''
      const host = this.localHost ? `${this.localHost} üzerinde` : 'Sitede'
      const stored = row.upload.size ? '' : row.upload.stored
      return [size, stored, row.upload.state === 'done' ? host : ''].filter(Boolean).join(' · ')
    },

    uploadLabel(row) {
      return `${row.upload.name} yükleniyor`
    },

    uploadText(row) {
      const { progress, loaded, total } = row.upload
      if (progress >= 100) return 'Sunucuda kaydediliyor…'
      if (!total) return 'Yükleme başlıyor…'
      return `%${progress} · ${videoSize(loaded)} / ${videoSize(total)}`
    },

    pickVideo(row, files) {
      const file = files?.[0]
      if (!file) return
      row.error = ''
      const extension = file.name.split('.').pop()?.toLowerCase() || ''
      if (!file.name.includes('.') || !this.videoExtensions.includes(extension)) {
        row.error = `Desteklenmeyen dosya: ${file.name}. ${this.videoHint}`
        return
      }
      if (this.maxVideoBytes && file.size > this.maxVideoBytes) {
        row.error = `${file.name} ${videoSize(this.maxVideoBytes)} sınırını aşıyor (${videoSize(file.size)}).`
        return
      }
      if (!this.seriesId) {
        row.error = 'Önce bölümün serisini seçin.'
        return
      }
      this.uploadVideo(row, file)
    },

    uploadVideo(row, file) {
      const request = new XMLHttpRequest()
      const seriesId = this.seriesId
      const before = { video: row.video, upload: { ...row.upload } }
      videoRequests.set(row.id, request)
      row.upload = {
        ...row.upload,
        state: 'uploading',
        progress: 0,
        loaded: 0,
        total: file.size,
        name: file.name,
        size: file.size,
      }
      this.announcement = `${file.name} yükleniyor.`
      const settle = () => {
        videoRequests.delete(row.id)
        if (!videoRequests.size) window.removeEventListener('beforeunload', this.guard)
      }
      request.open('POST', `/admin/bolumler/video?series_id=${encodeURIComponent(seriesId)}`)
      request.setRequestHeader('Accept', 'application/json')
      request.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
      const token =
        this.$refs.chapterFormEl?.querySelector('input[name="_csrf"]')?.value ||
        document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
      if (token) request.setRequestHeader('X-CSRF-TOKEN', token)
      request.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) return
        row.upload.loaded = event.loaded
        row.upload.total = event.total
        row.upload.progress = Math.min(100, Math.round((event.loaded / event.total) * 100))
      })
      request.addEventListener('load', () => {
        settle()
        let data = {}
        try {
          data = JSON.parse(request.responseText)
        } catch {
          data = {}
        }
        if (request.status >= 200 && request.status < 300 && typeof data.url === 'string') {
          row.video = data.url
          row.upload = {
            ...row.upload,
            state: 'done',
            progress: 100,
            name: data.name || file.name,
            size: Number(data.size) || file.size,
            seriesId,
          }
          this.announcement = `${row.upload.name} yüklendi.`
          return
        }
        const message =
          data.message ||
          (request.status === 413
            ? `Video çok büyük (en fazla ${videoSize(this.maxVideoBytes)}).`
            : `Video yüklenemedi (HTTP ${request.status}).`)
        this.restoreRow(row, before, message)
      })
      request.addEventListener('error', () => {
        settle()
        this.restoreRow(row, before, 'Bağlantı kesildi; video yüklenmedi. Tekrar deneyin.')
      })
      request.addEventListener('abort', () => {
        settle()
        this.restoreRow(row, before, '')
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: { text: 'Video yüklemesi iptal edildi.', tone: 'info' },
          })
        )
      })
      window.addEventListener('beforeunload', this.guard)
      const body = new FormData()
      body.append('video', file)
      request.send(body)
    },

    /** A failed or cancelled upload leaves the row as it was (an earlier video stays). */
    restoreRow(row, before, message) {
      row.video = before.video
      row.upload = { ...before.upload }
      row.error = message
      if (message) this.announcement = message
    },

    cancelVideo(row) {
      videoRequests.get(row.id)?.abort()
    },

    sourcesJSON() {
      return JSON.stringify(
        this.sources.map((row) => ({
          kind: row.kind,
          url: row.kind === 'local' ? row.video : row.link.trim(),
          host: row.kind === 'local' ? '' : row.host.trim(),
          label: row.label.trim(),
        }))
      )
    },

    /** Messages for rows that cannot be saved as they are; marks the rows too. */
    checkSources() {
      const messages = []
      if (!this.sources.length) messages.push('En az bir video kaynağı ekleyin.')
      this.sources.forEach((row, index) => {
        let error = ''
        if (row.kind === 'local' && !row.video) error = 'Video dosyası seçin.'
        else if (
          row.kind === 'local' &&
          row.upload.seriesId &&
          String(row.upload.seriesId) !== String(this.seriesId)
        )
          error = 'Bu video başka bir seriye yüklendi; videoyu yeniden yükleyin.'
        else if (row.kind === 'link' && !row.link.trim())
          error = 'Bağlantıyı veya iframe kodunu yapıştırın.'
        row.error = error
        if (error) messages.push(`${index + 1}. kaynak: ${error}`)
      })
      return messages
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
      if (this.isVideo) {
        if (this.videoUploading) {
          event.preventDefault()
          this.showErrors(['Video yüklemeleri bitmeden bölüm kaydedilemez.'])
          return
        }
        const problems = this.checkSources()
        if (problems.length) {
          event.preventDefault()
          this.showErrors(problems)
          return
        }
        // Alpine updates :value a tick later; write the current rows before the native submit.
        const field = event.target.querySelector('input[name="sources"]')
        if (field) field.value = this.sourcesJSON()
        this.$refs.pagesInput.value = ''
        return
      }
      const isText = this.format === 'text'
      if (!isText && this.allPages.length === 0) {
        event.preventDefault()
        this.showErrors(['En az bir sayfa görseli ekleyin.'])
        return
      }
      // Set new files on the file input via DataTransfer
      const newPages = isText ? [] : this.allPages.filter((p) => p.type === 'new')
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
        this.fail([
          'Bağlantı kesildi; bölüm kaydedilmedi. Bağlantınızı kontrol edip tekrar deneyin.',
        ])
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
      this.seriesFormats = data.formats || {}
      this.localHost = data.localHost || ''
      this.maxVideoBytes = Number(data.maxUploadBytes) || 0
      this.videoExtensions = Array.isArray(data.videoExtensions) ? data.videoExtensions : []
      let rows = data.sources
      if (typeof rows === 'string') {
        // The rows of a submit that failed validation (flashed `sources` field).
        try {
          rows = JSON.parse(rows)
        } catch {
          rows = []
        }
      }
      this.sources = (Array.isArray(rows) ? rows : [])
        .filter((row) => row && typeof row === 'object')
        .map((row) => this.makeRow(row))
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
        this.format = this.seriesFormats[this.seriesId] || ''
      }
      this.countWords(this.$el.querySelector('[name="text_content"]')?.value)
    },

    destroy() {
      window.removeEventListener('beforeunload', this.guard)
      for (const request of videoRequests.values()) request.abort()
      for (const page of this.allPages)
        if (page.type === 'new' && page.preview) URL.revokeObjectURL(page.preview)
    },
  }
}
