import { csrfToken } from './library.js'
import { tierOf, toast } from './shared.js'

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const maxBytes = 8 * 1024 * 1024
export const maxLength = 1000
const maxIndent = 3
/** "@name" right before the caret while typing a mention (2+ characters, as /uyeler/ara needs). */
const mentionQuery = /(^|[^\w@])@([a-zA-Z0-9_]{2,20})$/
/** Member suggestions by lower-case query, shared by every composer on the page. */
const mentionCache = new Map()

/** Short X-style relative time: "şimdi", "5 dk", "3 sa", "2 g", "12 Eki". */
export function shortTime(iso) {
  const date = new Date(iso)
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000)
  if (!Number.isFinite(seconds)) return ''
  if (seconds < 60) return 'şimdi'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dk`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} sa`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} g`
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** Relative time under author names: "az önce", "5 dk önce", "3 gün önce", then the date. */
export function timeAgo(iso) {
  const date = new Date(iso)
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000)
  if (!Number.isFinite(seconds)) return ''
  if (seconds < 90) return 'az önce'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dk önce`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} sa önce`
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} gün önce`
  if (seconds < 30 * 86400) return `${Math.floor(seconds / (7 * 86400))} hafta önce`
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Absolute stamp (title of the time): 08/12/2025, 11:20. */
export function stamp(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Scrolls to an element (optional) and flashes its outline (class c-flash). */
export function flash(element, scroll = true) {
  if (!element) return
  if (scroll) element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  element.classList.remove('c-flash')
  // Restart the animation when the same target is flashed twice.
  void element.offsetWidth
  element.classList.add('c-flash')
  setTimeout(() => element.classList.remove('c-flash'), 2000)
}

const emptyComposer = () => ({
  text: '',
  sticker: null,
  file: null,
  preview: '',
  spoiler: false,
  busy: false,
  error: '',
  dragging: false,
  /** Open @mention picker: { query, start, items, active } or null. */
  mention: null,
})

const emptyDraft = () => ({ text: '', spoiler: false, busy: false, error: '' })

/**
 * Threaded comments (partials/comments/section.edge). The tree is kept as a node map and
 * rendered as a flat list with depth, because Alpine has no recursive templates. Replies load
 * lazily per comment. With data-lazy the first page loads when the section comes into view.
 */
export default function commentSection() {
  return {
    seriesId: null,
    chapterId: null,
    me: null,
    sort: 'new',
    total: 0,
    counts: { roots: 0, replies: 0 },
    roots: [],
    nodes: {},
    page: 1,
    hasMore: false,
    loading: false,
    /** True once the first page answered (or failed); before that the skeleton shows. */
    ready: false,
    loadError: '',
    replyingTo: null,
    /** Comment being edited in place (its id) and the edit form state. */
    editing: null,
    draft: emptyDraft(),
    mentionTimer: 0,
    composers: { root: emptyComposer() },
    revealed: {},
    lightbox: '',
    stickers: null,
    maxLength,

    init() {
      const config = JSON.parse(this.$el.dataset.config)
      Object.assign(this, { seriesId: config.seriesId, chapterId: config.chapterId, me: config.me })
      // A link to one comment (#yorum-<id>, e.g. from Admin → Moderasyon) loads at once.
      const linked = window.location.hash.startsWith('#yorum-')
      if (this.$el.dataset.lazy && !linked && 'IntersectionObserver' in window) {
        this.observer = new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return
            this.observer.disconnect()
            this.observer = null
            this.load(true)
          },
          { rootMargin: '600px 0px' }
        )
        this.observer.observe(this.$el)
        return
      }
      this.load(true)
    },

    destroy() {
      this.observer?.disconnect()
    },

    url(path, params = {}) {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, value]) => value !== null && value !== undefined)
      )
      return `${path}?${query}`
    },

    async load(reset = false) {
      if (this.loading) return
      this.loading = true
      this.loadError = ''
      const page = reset ? 1 : this.page + 1
      try {
        const response = await fetch(
          this.url('/yorumlar', {
            series: this.seriesId,
            chapter: this.chapterId,
            sort: this.sort,
            page,
          }),
          { headers: { accept: 'application/json' }, credentials: 'same-origin' }
        )
        if (!response.ok) throw new Error()
        const data = await response.json()
        if (reset) {
          this.roots = []
          this.nodes = {}
        }
        for (const item of data.items) {
          this.add(item)
          this.roots.push(item.id)
        }
        this.page = page
        this.hasMore = data.hasMore
        this.total = data.total
        this.counts = { roots: data.roots ?? data.total, replies: data.replies ?? 0 }
        if (page === 1) this.showLinked()
      } catch {
        this.loadError = 'Yorumlar yüklenemedi. Bağlantını kontrol edip tekrar dene.'
      }
      this.loading = false
      this.ready = true
    },

    changeSort(sort) {
      if (this.sort === sort) return
      this.sort = sort
      this.load(true)
    },

    /** Adds a comment and its preloaded replies to the node map. */
    add(item) {
      const { replies = [], ...comment } = item
      this.nodes[comment.id] = {
        ...comment,
        expanded: false,
        children: [],
        page: 0,
        hasMore: false,
        loadingReplies: false,
      }
      for (const reply of replies) {
        this.add(reply)
        this.nodes[comment.id].children.push(reply.id)
      }
    },

    rows() {
      const rows = []
      const walk = (id) => {
        const node = this.nodes[id]
        if (!node) return
        rows.push({ key: `c${id}`, kind: 'comment', id, depth: node.depth })
        if (!node.expanded) return
        for (const child of node.children) walk(child)
        const remaining = node.replyCount - node.children.length
        if (remaining > 0)
          rows.push({ key: `m${id}`, kind: 'more', id, depth: node.depth + 1, remaining })
      }
      for (const id of this.roots) walk(id)
      return rows
    },

    indent(depth) {
      return `--d:${Math.min(depth, maxIndent)}`
    },

    /** Scrolls to the comment a reply answers and flashes it. */
    jumpTo(id) {
      flash(document.getElementById(`yorum-${id}`))
    },

    /** "N yanıt": shows the preview (or fetches the first page) and hides it again. */
    toggleReplies(id) {
      const node = this.nodes[id]
      if (!node) return
      node.expanded = !node.expanded
      if (node.expanded && !node.children.length && node.replyCount) this.loadReplies(id)
    },

    async loadReplies(id) {
      const node = this.nodes[id]
      if (!node || node.loadingReplies) return
      node.loadingReplies = true
      // The preview holds the oldest replies; fetch pages and skip the ones already shown.
      try {
        const page = node.page + 1
        const response = await fetch(this.url(`/yorumlar/${id}/yanitlar`, { page }), {
          headers: { accept: 'application/json' },
          credentials: 'same-origin',
        })
        if (!response.ok) throw new Error()
        const data = await response.json()
        for (const item of data.items) {
          if (this.nodes[item.id]) continue
          this.add(item)
          node.children.push(item.id)
        }
        node.page = page
        node.hasMore = data.hasMore
        if (!data.hasMore) node.replyCount = node.children.length
      } catch {
        toast('Yanıtlar yüklenemedi. Lütfen tekrar dene.', 'error')
      }
      node.loadingReplies = false
    },

    // ---- Composer -------------------------------------------------------------------------

    composer(key) {
      if (!this.composers[key]) this.composers[key] = emptyComposer()
      return this.composers[key]
    },

    openReply(id) {
      if (!this.me) return this.$dispatch('open-auth', 'login')
      this.replyingTo = this.replyingTo === id ? null : id
      this.composer(id)
      this.$nextTick(() => document.getElementById(`reply-${id}`)?.focus())
    },

    attach(key, file) {
      const state = this.composer(key)
      state.error = ''
      if (!file) return
      if (!allowedTypes.includes(file.type)) {
        state.error = 'Yalnızca JPG, PNG, WebP veya GIF ekleyebilirsin.'
        return
      }
      if (file.size > maxBytes) {
        state.error = 'Görsel en fazla 8 MB olabilir.'
        return
      }
      if (state.preview) URL.revokeObjectURL(state.preview)
      state.file = file
      state.preview = URL.createObjectURL(file)
    },

    pick(key, event) {
      this.attach(key, event.target.files?.[0])
      event.target.value = ''
    },

    paste(key, event) {
      const file = [...(event.clipboardData?.files || [])].find((item) =>
        item.type.startsWith('image/')
      )
      if (!file) return
      event.preventDefault()
      this.attach(key, file)
    },

    drop(key, event) {
      this.composer(key).dragging = false
      const file = [...(event.dataTransfer?.files || [])].find((item) =>
        item.type.startsWith('image/')
      )
      if (file) this.attach(key, file)
      else this.composer(key).error = 'Bırakılan öğe bir görsel değil.'
    },

    clearImage(key) {
      const state = this.composer(key)
      if (state.preview) URL.revokeObjectURL(state.preview)
      state.file = null
      state.preview = ''
    },

    canSend(key) {
      const state = this.composer(key)
      return Boolean(
        !state.busy &&
        (state.text.trim() || state.file || state.sticker) &&
        state.text.length <= maxLength
      )
    },

    async loadStickers() {
      if (this.stickers !== null) return
      try {
        const response = await fetch('/envanter', {
          headers: { accept: 'application/json' },
          credentials: 'same-origin',
        })
        if (!response.ok) throw new Error()
        this.stickers = (await response.json()).sticker || []
      } catch {
        this.stickers = []
      }
    },

    grow(event) {
      event.target.style.height = 'auto'
      event.target.style.height = `${event.target.scrollHeight}px`
    },

    async submit(key) {
      if (!this.me) return this.$dispatch('open-auth', 'login')
      const state = this.composer(key)
      if (!this.canSend(key)) return
      const form = new FormData()
      form.append('series_id', this.seriesId)
      if (this.chapterId) form.append('chapter_id', this.chapterId)
      if (key !== 'root') form.append('parent_id', key)
      form.append('body', state.text.trim())
      if (state.spoiler) form.append('spoiler', '1')
      if (state.sticker) form.append('sticker_id', state.sticker.id)
      if (state.file) form.append('image', state.file, state.file.name || 'gorsel')
      state.busy = true
      state.error = ''
      try {
        const response = await fetch('/yorumlar', {
          method: 'POST',
          body: form,
          credentials: 'same-origin',
          headers: { 'accept': 'application/json', 'x-csrf-token': csrfToken() },
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          state.error = data.error || data.errors?.[0]?.message || 'Yorum gönderilemedi.'
          state.busy = false
          return
        }
        this.add(data)
        if (key === 'root') {
          if (this.sort === 'new') this.roots.unshift(data.id)
          else this.roots.push(data.id)
        } else {
          const parent = this.nodes[key]
          parent.children.push(data.id)
          parent.replyCount++
          parent.expanded = true
          this.replyingTo = null
        }
        this.total++
        if (key === 'root') this.counts.roots++
        else this.counts.replies++
        this.clearImage(key)
        Object.assign(state, { text: '', sticker: null, spoiler: false, busy: false, mention: null })
        const textarea = document.getElementById('comment-root')
        if (key === 'root' && textarea) textarea.style.height = ''
        // Point at the new comment once it is rendered.
        this.$nextTick(() => flash(document.getElementById(`yorum-${data.id}`), key !== 'root'))
      } catch {
        state.error = 'Sunucuya ulaşılamadı.'
        state.busy = false
      }
    },

    // ---- @mentions ------------------------------------------------------------------------

    /** Opens, updates or closes the member picker from the text before the caret. */
    mentionInput(key, event) {
      const state = this.composer(key)
      const input = event.target
      const match = input.value.slice(0, input.selectionStart).match(mentionQuery)
      if (!this.me || !match) return this.closeMention(key)
      const query = match[2]
      if (state.mention?.query === query) return
      state.mention = {
        query,
        start: input.selectionStart - query.length - 1,
        items: state.mention?.items || [],
        active: 0,
      }
      clearTimeout(this.mentionTimer)
      this.mentionTimer = setTimeout(() => this.suggest(key, query), 180)
    },

    async suggest(key, query) {
      const cacheKey = query.toLowerCase()
      let items = mentionCache.get(cacheKey)
      if (!items) {
        try {
          const response = await fetch(this.url('/uyeler/ara', { q: query }), {
            headers: { accept: 'application/json' },
            credentials: 'same-origin',
          })
          if (!response.ok) throw new Error()
          items = (await response.json()).items || []
          mentionCache.set(cacheKey, items)
        } catch {
          items = []
        }
      }
      const state = this.composer(key)
      // Typing went on while the answer was on its way.
      if (state.mention?.query !== query) return
      state.mention.items = items
      state.mention.active = 0
    },

    mentionOpen(key) {
      return Boolean(this.composer(key).mention?.items.length)
    },

    mentionItems(key) {
      return this.composer(key).mention?.items || []
    },

    mentionActiveId(key) {
      const mention = this.composer(key).mention
      return mention?.items.length ? `mention-${key}-${mention.active}` : null
    },

    closeMention(key) {
      clearTimeout(this.mentionTimer)
      this.composer(key).mention = null
    },

    /** ↑ ↓ move, Enter / Tab insert, Escape closes; other keys reach the textarea. */
    mentionKeydown(key, event) {
      const mention = this.composer(key).mention
      if (!mention?.items.length || event.ctrlKey || event.metaKey || event.altKey) return
      const count = mention.items.length
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        mention.active = (mention.active + (event.key === 'ArrowDown' ? 1 : count - 1)) % count
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        this.pickMention(key, mention.items[mention.active])
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        this.closeMention(key)
      }
    },

    /** Replaces the typed "@que" with "@username " and puts the caret after it. */
    pickMention(key, item) {
      const state = this.composer(key)
      const mention = state.mention
      if (!mention || !item) return
      const input = document.getElementById(key === 'root' ? 'comment-root' : `reply-${key}`)
      const end = input ? input.selectionStart : mention.start + mention.query.length + 1
      const insert = `@${item.username} `
      state.text = state.text.slice(0, mention.start) + insert + state.text.slice(end)
      this.closeMention(key)
      if (!input) return
      // At once, not in $nextTick (a timer): a fast typist's next key would land before the caret
      // moves. x-model leaves an equal value alone, so the caret stays.
      const caret = mention.start + insert.length
      input.value = state.text
      input.focus()
      input.setSelectionRange(caret, caret)
    },

    // ---- Editing ----------------------------------------------------------------------------

    startEdit(id) {
      const node = this.nodes[id]
      if (!node || !node.canEdit) return
      this.editing = id
      this.draft = { ...emptyDraft(), text: node.body || '', spoiler: Boolean(node.spoiler) }
      this.$nextTick(() => {
        const input = document.getElementById(`edit-${id}`)
        if (!input) return
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
        this.grow({ target: input })
      })
    },

    cancelEdit() {
      const id = this.editing
      this.editing = null
      this.draft = emptyDraft()
      // Back to the comment's menu button, so keyboard users keep their place.
      this.$nextTick(() =>
        document.querySelector(`#yorum-${id} [aria-label="Yorum seçenekleri"]`)?.focus()
      )
    },

    canSave() {
      const node = this.nodes[this.editing]
      if (!node || this.draft.busy || this.draft.text.length > maxLength) return false
      return Boolean(this.draft.text.trim() || node.image || node.sticker)
    },

    async saveEdit(id) {
      const node = this.nodes[id]
      if (!node || !this.canSave()) return
      this.draft.busy = true
      this.draft.error = ''
      try {
        const response = await fetch(`/yorumlar/${id}/duzenle`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'accept': 'application/json',
            'x-csrf-token': csrfToken(),
          },
          body: JSON.stringify({
            body: this.draft.text.trim(),
            ...(this.draft.spoiler ? { spoiler: '1' } : {}),
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          this.draft.error = data.error || data.errors?.[0]?.message || 'Yorum kaydedilemedi.'
          this.draft.busy = false
          return
        }
        Object.assign(node, {
          body: data.body,
          bodyHtml: data.bodyHtml,
          spoiler: data.spoiler,
          editedAt: data.editedAt,
          canEdit: data.canEdit,
        })
        this.editing = null
        this.draft = emptyDraft()
        toast('Yorum güncellendi.', 'success')
        this.$nextTick(() => flash(document.getElementById(`yorum-${id}`), false))
      } catch {
        this.draft.error = 'Sunucuya ulaşılamadı.'
        this.draft.busy = false
      }
    },

    // ---- Actions --------------------------------------------------------------------------

    async post(path) {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'accept': 'application/json', 'x-csrf-token': csrfToken() },
      })
      if (!response.ok) throw new Error()
      return response.json()
    },

    /** Up/down vote with an optimistic update corrected by the server answer. */
    async vote(id, value) {
      if (!this.me) return this.$dispatch('open-auth', 'login')
      const node = this.nodes[id]
      if (!node) return
      const before = { vote: node.vote, likeCount: node.likeCount, dislikeCount: node.dislikeCount }
      const next = node.vote === value ? 0 : value
      if (node.vote === 1) node.likeCount--
      if (node.vote === -1) node.dislikeCount--
      if (next === 1) node.likeCount++
      if (next === -1) node.dislikeCount++
      node.vote = next
      try {
        const response = await fetch(`/yorumlar/${id}/oy`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'accept': 'application/json',
            'x-csrf-token': csrfToken(),
          },
          body: JSON.stringify({ value }),
        })
        if (!response.ok) throw new Error()
        const result = await response.json()
        Object.assign(node, {
          vote: result.vote,
          likeCount: result.likeCount,
          dislikeCount: result.dislikeCount,
        })
      } catch {
        Object.assign(node, before)
        toast('Oy kaydedilemedi. Lütfen tekrar dene.', 'error')
      }
    },

    /** Deletes a comment; the confirmation dialog (form data-confirm) has already asked. */
    async remove(id) {
      const node = this.nodes[id]
      if (!node) return
      try {
        const { deleted } = await this.post(`/yorumlar/${id}/sil`)
        this.total = Math.max(0, this.total - 1)
        if (node.parentId) this.counts.replies = Math.max(0, this.counts.replies - 1)
        else this.counts.roots = Math.max(0, this.counts.roots - 1)
        if (this.replyingTo === id) this.replyingTo = null
        if (this.editing === id) this.editing = null
        toast('Yorum silindi.', 'success')
        if (deleted === 'soft') {
          Object.assign(node, {
            deleted: true,
            body: '',
            bodyHtml: '',
            editedAt: null,
            canEdit: false,
            image: null,
            author: null,
            sticker: null,
            canDelete: false,
            spoiler: false,
          })
          return
        }
        if (node.parentId && this.nodes[node.parentId]) {
          const parent = this.nodes[node.parentId]
          parent.children = parent.children.filter((child) => child !== id)
          parent.replyCount = Math.max(0, parent.replyCount - 1)
        } else {
          this.roots = this.roots.filter((root) => root !== id)
        }
        // Drop the node after its row has left the list.
        this.$nextTick(() => delete this.nodes[id])
      } catch {
        toast('Yorum silinemedi. Lütfen tekrar dene.', 'error')
      }
    },

    /** Members may report other people's comments (the server checks again). */
    canReport(node) {
      return Boolean(this.me && node && !node.deleted && node.author && node.author.username !== this.me.username)
    },

    /** Opens the report dialog (partials/report/dialog.edge) for a comment. */
    report(node) {
      this.$dispatch('open-report', {
        type: 'comment',
        id: node.id,
        set: 'content',
        label: `@${node.author.username} kişisinin yorumu`,
      })
    },

    /** A link to #yorum-<id> (e.g. from the moderation page) points at that comment once loaded. */
    showLinked() {
      const match = /^#yorum-(\d+)$/.exec(window.location.hash)
      if (match && this.nodes[match[1]])
        this.$nextTick(() => flash(document.getElementById(`yorum-${match[1]}`)))
    },

    wallStyle(visual) {
      return visual.img ? `background-image:url('${visual.img}')` : visual.css || ''
    },

    time: shortTime,
    ago: timeAgo,
    stamp,
    tierOf,
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { commentSection }
