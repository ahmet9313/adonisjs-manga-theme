/**
 * Colour scheme switch (Koyu / Açık / Sistem). The server renders `<html data-theme>` from the
 * `theme` cookie, so this only has to update the attribute and the cookie; every switch on the
 * page shares the `scheme` store and stays in sync.
 */
const schemes = ['dark', 'light', 'system']
const labels = { dark: 'Koyu', light: 'Açık', system: 'Sistem' }

function themeColor() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--t-header-bg').trim()
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.remove()
  if (!value) return
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = value.length === 9 ? value.slice(0, 7) : value
  document.head.append(meta)
}

export function registerScheme(Alpine) {
  Alpine.store('scheme', {
    value: document.documentElement.dataset.theme || 'dark',
    labels,

    set(value) {
      if (!schemes.includes(value)) return
      this.value = value
      document.documentElement.dataset.theme = value
      const secure = window.location.protocol === 'https:' ? '; secure' : ''
      document.cookie = `theme=${value}; path=/; max-age=31536000; samesite=lax${secure}`
      themeColor()
    },
  })
}

/** Optional component wrapper for a single switch: `x-data="themeSwitch"`. */
function themeSwitch() {
  return {
    get scheme() {
      return this.$store.scheme.value
    },
    set(value) {
      this.$store.scheme.set(value)
    },
    is(value) {
      return this.$store.scheme.value === value
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { themeSwitch }
