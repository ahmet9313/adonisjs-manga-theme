import { send, toast } from './shared.js'

/**
 * The site-wide report dialog (partials/report/dialog.edge, once per page). Open it with
 *   $dispatch('open-report', { type: 'chapter' | 'comment' | 'review', id, set, label })
 * where `set` names the reason list (image, text, video or content; config/moderation.ts) and
 * `label` says what is reported. Chapters can be reported by guests; comments and reviews ask
 * guests to sign in first. The server checks everything again.
 */
export function reportDialog() {
  return {
    open: false,
    target: null,
    reasons: [],
    reason: '',
    note: '',
    busy: false,
    error: '',
    sets: {},
    noteMax: 500,
    signedIn: false,

    init() {
      const config = JSON.parse(this.$el.dataset.config)
      Object.assign(this, {
        sets: config.reasons,
        noteMax: config.noteMax,
        signedIn: config.signedIn,
      })
    },

    get isChapter() {
      return this.target?.type === 'chapter'
    },

    /** Example note for the reason list in use. */
    get placeholder() {
      const examples = {
        image: 'Örn. 12. sayfadan sonrası boş görünüyor.',
        text: 'Örn. son paragraflar eksik.',
        video: 'Örn. 2. kaynak açılmıyor, diğerleri çalışıyor.',
      }
      return examples[this.target?.set] || 'Moderatörlerin bilmesi gereken bir şey var mı?'
    },

    show(detail) {
      if (!detail?.type || !detail.id) return
      if (detail.type !== 'chapter' && !this.signedIn) {
        this.$dispatch('open-auth', 'login')
        return
      }
      Object.assign(this, {
        target: detail,
        reasons: this.sets[detail.set] || this.sets.content || [],
        reason: '',
        note: '',
        error: '',
        busy: false,
        open: true,
      })
    },

    close() {
      if (!this.busy) this.open = false
    },

    async submit() {
      if (this.busy || !this.target) return
      this.error = ''
      if (!this.reason) {
        this.error = 'Bir neden seç.'
        return
      }
      if (this.reason === 'other' && !this.note.trim()) {
        this.error = '“Diğer” için sorunu kısaca anlat.'
        this.$refs.note?.focus()
        return
      }
      this.busy = true
      try {
        const data = await send('/bildir', {
          target_type: this.target.type,
          target_id: this.target.id,
          reason: this.reason,
          note: this.note.trim() || undefined,
        })
        this.busy = false
        this.open = false
        toast(data.message, 'success')
      } catch (error) {
        this.busy = false
        this.error = error instanceof TypeError ? 'Sunucuya ulaşılamadı.' : error.message
      }
    },
  }
}

/** Button that opens the dialog with the JSON in its data-report attribute. */
export function reportTrigger() {
  return {
    openReport() {
      this.$dispatch('open-report', JSON.parse(this.$el.dataset.report))
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { reportDialog, reportTrigger }
