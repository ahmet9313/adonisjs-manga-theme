/**
 * Shared library helpers. Signed-in readers store bookmarks and reading history on the server
 * (body[data-account]); guests keep them in localStorage under `bookmark:` and `read:` keys.
 */
export const isAccount = () => document.body.dataset.account === '1'

export const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.content || ''

export async function postJson(url, body) {
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
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

const readKey = (type, slug) => `read:${type}:${slug}`

/** Local reading history: chapters in reading order, the last entry is the most recent. */
export function readLocal(type, slug) {
  try {
    const data = JSON.parse(window.localStorage.getItem(readKey(type, slug)) || 'null')
    const chapters = Array.isArray(data?.chapters) ? data.chapters.filter(Number.isFinite) : []
    return { chapters, last: chapters.length ? chapters.at(-1) : null }
  } catch {
    return { chapters: [], last: null }
  }
}

/** Adds chapters to the local history in the given order (the last one becomes the latest). */
export function markLocal(type, slug, ...numbers) {
  try {
    const chapters = readLocal(type, slug).chapters.filter((item) => !numbers.includes(item))
    chapters.push(...numbers)
    window.localStorage.setItem(
      readKey(type, slug),
      JSON.stringify({ chapters: chapters.slice(-5000), at: Date.now() })
    )
    return true
  } catch {
    /* Storage may be disabled by the browser. */
    return false
  }
}

/** "Okunmadı olarak işaretle" for guests. */
export function unmarkLocal(type, slug, number) {
  try {
    const chapters = readLocal(type, slug).chapters.filter((item) => item !== number)
    window.localStorage.setItem(
      readKey(type, slug),
      JSON.stringify({ chapters, at: Date.now() })
    )
    return true
  } catch {
    return false
  }
}

/** Marks a chapter as read for guests; the server records it for signed-in readers. */
export function readingTracker() {
  return {
    init() {
      if (isAccount()) return
      const { type, slug, number } = JSON.parse(this.$el.dataset.chapter)
      markLocal(type, slug, number)
    },
  }
}

/**
 * "Okumaya devam et" button on the series page. Follows `reading-changed` ({ last }) from the
 * chapter list when chapters are marked read or unread there.
 */
export function continueReading() {
  return {
    last: null,
    type: '',
    slug: '',
    init() {
      const config = JSON.parse(this.$el.dataset.config)
      Object.assign(this, { type: config.type, slug: config.slug })
      this.last = isAccount() ? config.last : readLocal(config.type, config.slug).last
      if (this.last !== null && !config.chapters.includes(this.last)) this.last = null
      this.onChange = (event) => {
        const last = event.detail?.last ?? null
        this.last = last !== null && config.chapters.includes(last) ? last : null
      }
      window.addEventListener('reading-changed', this.onChange)
    },
    destroy() {
      window.removeEventListener('reading-changed', this.onChange)
    },
    get href() {
      return `/series/${encodeURIComponent(this.type)}/${encodeURIComponent(this.slug)}/${this.last}`
    },
  }
}

/** Reading status saved with a guest bookmark (bookmarks.js); older copies have none. */
function storedStatus(key) {
  try {
    const status = JSON.parse(window.localStorage.getItem(key))?.status
    return typeof status === 'string' ? status : 'reading'
  } catch {
    return 'reading'
  }
}

/** After signing in, moves the guest library into the account once and clears the local copy. */
export function librarySync() {
  return {
    async init() {
      const bookmarks = []
      const reads = []
      const keys = []
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i)
          const [prefix, type, slug] = key?.split(':') || []
          if (!type || !slug) continue
          if (prefix === 'bookmark') bookmarks.push({ type, slug, status: storedStatus(key) })
          else if (prefix === 'read') {
            const { chapters } = readLocal(type, slug)
            if (chapters.length) reads.push({ type, slug, chapters: chapters.slice(-5000) })
          } else continue
          keys.push(key)
        }
      } catch {
        return
      }
      if (!keys.length) return
      try {
        await postJson('/kutuphane/aktar', {
          bookmarks: bookmarks.slice(0, 1000),
          reads: reads.slice(0, 1000),
        })
        for (const key of keys) window.localStorage.removeItem(key)
      } catch {
        /* Try again on the next page view. */
      }
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { readingTracker, continueReading, librarySync }
