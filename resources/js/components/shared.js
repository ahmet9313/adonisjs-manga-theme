import { csrfToken } from './library.js'

/** POST helper for JSON endpoints; throws with the server message on failure. */
export async function send(url, body = {}) {
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
  if (!response.ok) throw new Error(data.error || data.errors?.[0]?.message || 'İşlem tamamlanamadı.')
  return data
}

export function toast(text, tone = 'success', image = '') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { text, tone, image } }))
}

export const tierOf = (level) => (level >= 50 ? 4 : level >= 25 ? 3 : level >= 10 ? 2 : 1)

/** Relative time used by the inbox: "şimdi", "5 dakika", "3 saat", "2 gün". */
export function ago(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (!Number.isFinite(seconds)) return ''
  if (seconds < 60) return 'şimdi'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dakika`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} saat`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)} gün`
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}
