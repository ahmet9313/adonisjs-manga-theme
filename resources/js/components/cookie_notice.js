/**
 * Cookie notice (partials/cookie_notice.edge): "Tamam" writes the same plain cookie as the
 * fallback form (/cerez-onayi) and hides the bar without reloading the page. The server leaves
 * the bar out once the cookie is there.
 */
const cookieNotice = () => ({
  open: true,

  accept() {
    document.cookie = `cookie_ok=1; max-age=${365 * 24 * 60 * 60}; path=/; samesite=lax`
    this.open = false
  },
})

export const components = { cookieNotice }
