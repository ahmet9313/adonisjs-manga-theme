import { chapterPicker } from './reader.js'

/**
 * Episode player (pages/episode_watch.edge, partials/watch/*).
 *
 * `data-player` (JSON): { sources: [{ host, kind, url, label }], title, base }. A source plays
 * only when it is chosen (the "İzle" button starts the remembered or the first source), so no
 * third-party player loads before the viewer asks for it.
 *
 * - local / file sources play in <video>, embed sources in an <iframe>. The media element is
 *   created here and replaced on every change, so switching players never adds history entries.
 * - A <video> that fails shows a message with "Sonraki kaynağı dene".
 * - The last host is remembered in localStorage ("watch-prefs") to pre-select it on the next
 *   episode; nothing autoplays on page load.
 *
 * Texts that depend on data are built here from the JSON, never in inline Alpine strings
 * (AGENTS.md rule 9).
 */

const prefsKey = 'watch-prefs'

function readHost() {
  try {
    const data = JSON.parse(window.localStorage.getItem(prefsKey) || 'null')
    return typeof data?.host === 'string' ? data.host : ''
  } catch {
    return ''
  }
}

function saveHost(host) {
  try {
    window.localStorage.setItem(prefsKey, JSON.stringify({ host }))
  } catch {
    /* Private windows may block storage; the player works without it. */
  }
}

/** Only http(s) players and this site's own files are ever loaded. */
function safeUrl(value) {
  try {
    const url = new URL(String(value || ''), window.location.href)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

function episodePlayer() {
  return {
    ...chapterPicker,
    base: '',
    title: '',
    sources: [],
    /** Index of the playing source, or null before the viewer starts one. */
    playing: null,
    /** idle (instructions) | playing | error */
    state: 'idle',
    rememberedHost: '',
    announcement: '',

    init() {
      let config = {}
      try {
        config = JSON.parse(this.$el.dataset.player || '{}')
      } catch {
        config = {}
      }
      this.base = config.base || ''
      this.title = config.title || ''
      this.sources = Array.isArray(config.sources) ? config.sources : []
      this.rememberedHost = readHost()
    },

    destroy() {
      this.$refs.screen?.replaceChildren()
    },

    get current() {
      return this.playing === null ? null : (this.sources[this.playing] ?? null)
    },

    /** Source the "İzle" button starts: the remembered host if this episode has it, else the first. */
    get startIndex() {
      const index = this.sources.findIndex((source) => source.host === this.rememberedHost)
      return index >= 0 ? index : 0
    },

    get startLabel() {
      return this.sources[this.startIndex]?.host ?? ''
    },

    get nowPlaying() {
      return this.current?.host ?? ''
    },

    /** Index of the source after the playing one, or null at the end of the list. */
    get nextSource() {
      if (this.playing === null || this.playing + 1 >= this.sources.length) return null
      return this.playing + 1
    },

    /** Marks the source "İzle" would start, while nothing plays yet. */
    isNext(index) {
      return this.playing === null && index === this.startIndex
    },

    // ---- Playback ---------------------------------------------------------------------------
    start() {
      this.play(this.startIndex, true)
    },

    playNext() {
      if (this.nextSource !== null) this.play(this.nextSource, true)
    },

    play(index, focusPlayer = false) {
      const source = this.sources[index]
      if (!source) return
      this.playing = index
      this.rememberedHost = source.host
      saveHost(source.host)
      const element = this.mount(source)
      if (!element) return
      this.state = 'playing'
      this.announcement = `Oynatılıyor: ${source.host}.`
      if (focusPlayer) this.$nextTick(() => element.focus({ preventScroll: true }))
      this.$nextTick(() => this.reveal())
    },

    /** Brings the player into view when it is mostly off screen (phones: list under the player). */
    reveal() {
      const stage = this.$refs.stage
      if (!stage) return
      const box = stage.getBoundingClientRect()
      if (box.top < 0 || box.top > window.innerHeight * 0.5)
        stage.scrollIntoView({
          block: 'start',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
    },

    mount(source) {
      const screen = this.$refs.screen
      const url = safeUrl(source.url)
      if (!screen) return null
      if (!url) {
        this.fail()
        return null
      }
      const name = `${source.host} oynatıcısı${this.title ? `: ${this.title}` : ''}`
      let element
      if (source.kind === 'embed') {
        element = document.createElement('iframe')
        element.setAttribute('title', name)
        element.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media')
        element.setAttribute('allowfullscreen', '')
        element.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
        element.setAttribute('src', url)
      } else {
        element = document.createElement('video')
        element.setAttribute('controls', '')
        element.setAttribute('playsinline', '')
        element.setAttribute('preload', 'metadata')
        element.setAttribute('aria-label', name)
        element.addEventListener('error', () => this.fail(), { once: true })
        element.setAttribute('src', url)
      }
      element.className = 'watch-media'
      screen.replaceChildren(element)
      // The viewer asked for this source: start it (browsers may still refuse; controls remain).
      if (element instanceof HTMLVideoElement) element.play()?.catch(() => {})
      return element
    },

    fail() {
      // Focus follows the message only when it was on the failed player (not in the list).
      const active = document.activeElement
      const inStage = !active || active === document.body || this.$refs.stage?.contains(active)
      this.$refs.screen?.replaceChildren()
      this.state = 'error'
      this.announcement = 'Bu kaynak oynatılamadı.'
      if (inStage) this.$nextTick(() => this.$refs.error?.focus({ preventScroll: true }))
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { episodePlayer }
