import { toast } from './shared.js'

/** Copies `text` with the Clipboard API, or with a hidden field on insecure origins. */
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.append(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  if (!copied) throw new Error('copy failed')
}

/**
 * Share menu and row (partials/share/*). The network links are plain links; this adds the
 * device share sheet on touch screens that have one (`canShare`) and "copy the link".
 * The address and title come from data-share-url / data-share-title.
 */
export function shareLinks() {
  return {
    canShare: false,

    init() {
      this.canShare =
        typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches
    },

    data() {
      const { shareUrl, shareTitle } = this.$root.dataset
      return { url: shareUrl || window.location.href, title: shareTitle || document.title }
    },

    async native() {
      try {
        await navigator.share(this.data())
      } catch (error) {
        if (error?.name !== 'AbortError') await this.copy()
      }
    },

    async copy() {
      try {
        await copyText(this.data().url)
        toast('Bağlantı kopyalandı.', 'success')
      } catch {
        toast('Bağlantı kopyalanamadı. Adres çubuğundan kopyalayabilirsin.', 'error')
      }
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { shareLinks }
