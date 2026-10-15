import { csrfToken } from './library.js'
import { tierOf } from './community.js'
import { shortTime, stamp } from './comments.js'

const emptyForm = () => ({
  rating: 0,
  hover: 0,
  title: '',
  body: '',
  spoiler: false,
  busy: false,
  error: '',
  open: false,
})

/**
 * Series page: rating summary, the reader's own rating/review form and the list of reviews.
 * Everything is loaded from /incelemeler; the first summary comes with the page.
 */
export default function reviewSection() {
  return {
    seriesId: null,
    me: null,
    labels: [],
    summary: { average: 0, count: 0, written: 0, distribution: Array(10).fill(0) },
    mine: null,
    items: [],
    page: 1,
    hasMore: false,
    loading: false,
    loadError: '',
    sort: 'helpful',
    withText: true,
    form: emptyForm(),
    expanded: {},
    revealed: {},
    confirmingDelete: null,

    init() {
      const config = JSON.parse(this.$el.dataset.config)
      Object.assign(this, {
        seriesId: config.seriesId,
        me: config.me,
        labels: config.labels,
        summary: config.summary,
      })
      this.load(true)
    },

    // ---- Summary --------------------------------------------------------------------------

    /** Share of the largest histogram bar, so the busiest score always fills its row. */
    barWidth(score) {
      const max = Math.max(1, ...this.summary.distribution)
      return Math.round((this.summary.distribution[score - 1] / max) * 100)
    },

    starFill() {
      return Math.round((this.summary.average / 10) * 100)
    },

    // ---- List -----------------------------------------------------------------------------

    async load(reset = false) {
      if (this.loading) return
      this.loading = true
      this.loadError = ''
      const page = reset ? 1 : this.page + 1
      try {
        const query = new URLSearchParams({
          series: this.seriesId,
          sort: this.sort,
          page,
          text: this.withText ? '1' : '0',
        })
        const response = await fetch(`/incelemeler?${query}`, {
          headers: { accept: 'application/json' },
          credentials: 'same-origin',
        })
        if (!response.ok) throw new Error()
        const data = await response.json()
        if (reset) this.items = []
        this.items.push(...data.items)
        this.page = page
        this.hasMore = data.hasMore
        if (data.summary) this.summary = data.summary
        if (page === 1 && 'mine' in data) this.setMine(data.mine)
      } catch {
        this.loadError = 'İncelemeler yüklenemedi.'
      }
      this.loading = false
    },

    changeSort(sort) {
      if (this.sort === sort) return
      this.sort = sort
      this.load(true)
    },

    toggleText() {
      this.withText = !this.withText
      this.load(true)
    },

    // ---- Own rating -----------------------------------------------------------------------

    setMine(mine) {
      this.mine = mine
      if (mine) {
        Object.assign(this.form, {
          rating: mine.rating,
          title: mine.title || '',
          body: mine.body || '',
          spoiler: mine.spoiler,
        })
      }
    },

    openForm() {
      if (!this.me) return this.$dispatch('open-auth', 'login')
      this.form.open = true
      this.$nextTick(() => document.getElementById('review-body')?.focus())
    },

    label(rating) {
      return rating ? `${rating} · ${this.labels[rating - 1]}` : 'Puan seç'
    },

    canSend() {
      return !this.form.busy && this.form.rating >= 1 && this.form.body.length <= 4000
    },

    async submit() {
      if (!this.me) return this.$dispatch('open-auth', 'login')
      if (!this.canSend()) return
      const form = this.form
      const body = form.body.trim()
      if (body && body.length < 10) {
        form.error = 'İnceleme en az 10 karakter olmalı. Yalnızca puan vermek için boş bırakabilirsin.'
        return
      }
      form.busy = true
      form.error = ''
      try {
        const payload = new URLSearchParams({
          series_id: this.seriesId,
          rating: form.rating,
          title: form.title.trim(),
          body,
        })
        if (!payload.get('title')) payload.delete('title')
        if (!body) payload.delete('body')
        if (form.spoiler && body) payload.set('spoiler', '1')
        const response = await fetch('/incelemeler', {
          method: 'POST',
          body: payload,
          credentials: 'same-origin',
          headers: { 'accept': 'application/json', 'x-csrf-token': csrfToken() },
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          form.error = data.error || data.errors?.[0]?.message || 'Gönderilemedi.'
          form.busy = false
          return
        }
        this.summary = data.summary
        this.setMine(data.mine)
        form.open = false
        form.busy = false
        this.load(true)
      } catch {
        form.error = 'Sunucuya ulaşılamadı.'
        form.busy = false
      }
    },

    async remove(item) {
      if (this.confirmingDelete !== item.id) {
        this.confirmingDelete = item.id
        return
      }
      this.confirmingDelete = null
      try {
        const response = await fetch(`/incelemeler/${item.id}/sil`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'accept': 'application/json', 'x-csrf-token': csrfToken() },
        })
        if (!response.ok) throw new Error()
        const data = await response.json()
        this.summary = data.summary
        this.items = this.items.filter((entry) => entry.id !== item.id)
        if (item.own) {
          this.mine = null
          Object.assign(this.form, emptyForm())
        }
      } catch {
        this.loadError = 'İnceleme silinemedi.'
      }
    },

    async vote(item) {
      if (!this.me) return this.$dispatch('open-auth', 'login')
      if (item.own) return
      const before = { voted: item.voted, helpfulCount: item.helpfulCount }
      item.voted = !item.voted
      item.helpfulCount += item.voted ? 1 : -1
      try {
        const response = await fetch(`/incelemeler/${item.id}/faydali`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'accept': 'application/json', 'x-csrf-token': csrfToken() },
        })
        if (!response.ok) throw new Error()
        Object.assign(item, await response.json())
      } catch {
        Object.assign(item, before)
      }
    },

    isLong(item) {
      return (item.body || '').length > 360
    },

    wallStyle(visual) {
      return visual.img ? `background-image:url('${visual.img}')` : visual.css || ''
    },

    time: shortTime,
    stamp,
    tierOf,
  }
}
