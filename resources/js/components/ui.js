/**
 * Behaviour shared by the design-system components (resources/views/components/ui/*).
 *
 * - `$layers`: stacking order of open modals and drawers, so Escape closes only the top one.
 * - `dropdown`: disclosure menu (button + panel); Escape, outside click and arrow keys.
 * - `tabs`: WAI-ARIA tabs with arrow, Home and End keys (automatic activation).
 * - `confirmHost`: one confirmation dialog for every `<form data-confirm="…">`.
 * - Delegated helpers: `<img data-fallback>` and `<form data-submit-once>`.
 *
 * Dynamic text never goes into inline JavaScript (AGENTS.md rule 9): templates pass it
 * through data attributes and these components read it.
 */

/** Plain (non-reactive) stack: reading it inside x-effect must not re-trigger other effects. */
const stack = []
const layers = {
  open(id) {
    this.close(id)
    stack.push(id)
  },
  close(id) {
    const index = stack.indexOf(id)
    if (index !== -1) stack.splice(index, 1)
  },
  sync(id, open) {
    if (open) this.open(id)
    else this.close(id)
  },
  isTop(id) {
    return stack.at(-1) === id
  },
  get size() {
    return stack.length
  },
}

const focusable =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Visible, in the tab order and not hidden from assistive technology. */
const tabbable = (el) =>
  el.getClientRects().length > 0 &&
  el.getAttribute('tabindex') !== '-1' &&
  !el.closest('[aria-hidden="true"], [inert]')

function dropdown() {
  return {
    open: false,

    toggle() {
      if (this.open) this.close()
      else this.show()
    },

    show() {
      this.open = true
    },

    close(returnFocus = false) {
      if (!this.open) return
      this.open = false
      if (returnFocus) this.$refs.button?.focus()
    },

    items() {
      const panel = this.$refs.panel
      return panel ? [...panel.querySelectorAll(focusable)].filter(tabbable) : []
    },

    /** Arrow keys move through the panel, Escape closes it and returns focus to the button. */
    onKeydown(event) {
      if (event.key === 'Escape' && this.open) {
        event.stopPropagation()
        this.close(true)
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      if (!this.open) {
        if (event.key === 'ArrowDown' && event.target === this.$refs.button) {
          event.preventDefault()
          this.show()
          this.$nextTick(() => this.items()[0]?.focus())
        }
        return
      }
      const items = this.items()
      if (!items.length) return
      event.preventDefault()
      const index = items.indexOf(document.activeElement)
      const next = {
        ArrowDown: index + 1 >= items.length ? 0 : index + 1,
        ArrowUp: index <= 0 ? items.length - 1 : index - 1,
        Home: 0,
        End: items.length - 1,
      }[event.key]
      items[next]?.focus()
    },
  }
}

/**
 * Tabs: `<div x-data="tabs" data-active="key">`, tab buttons with `data-tab="key"` inside a
 * `role="tablist"` (bind `:aria-selected="is('key')"` and `:tabindex="is('key') ? 0 : -1"`), and
 * panels with `:hidden="!is('key')"`. The server renders the initial state for no-JS visitors.
 */
function tabs() {
  return {
    active: '',

    init() {
      this.active =
        this.$el.dataset.active || this.$el.querySelector('[role="tab"][data-tab]')?.dataset.tab || ''
    },

    is(key) {
      return this.active === key
    },

    select(key) {
      this.active = key
      this.$dispatch('tab-change', key)
    },

    onKeydown(event) {
      const list = [...event.currentTarget.querySelectorAll('[role="tab"][data-tab]')]
      const index = list.indexOf(event.target)
      if (index === -1) return
      const vertical = event.currentTarget.getAttribute('aria-orientation') === 'vertical'
      const keys = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
      let next = null
      if (event.key === keys[0]) next = index <= 0 ? list.length - 1 : index - 1
      else if (event.key === keys[1]) next = index + 1 >= list.length ? 0 : index + 1
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = list.length - 1
      if (next === null) return
      event.preventDefault()
      list[next].focus()
      this.select(list[next].dataset.tab)
    },
  }
}

/**
 * One dialog for every `<form data-confirm="Mesaj">`. Optional `data-confirm-title`,
 * `data-confirm-label` (button text) and `data-confirm-tone="danger|accent"`.
 * Without JavaScript the form simply submits.
 */
function confirmHost() {
  return {
    open: false,
    title: '',
    message: '',
    label: '',
    tone: 'danger',
    form: null,
    submitter: null,

    init() {
      document.addEventListener(
        'submit',
        (event) => {
          const form = event.target
          if (!(form instanceof HTMLFormElement) || !form.dataset.confirm) return
          if (form.dataset.confirmed === '1') {
            delete form.dataset.confirmed
            return
          }
          event.preventDefault()
          event.stopImmediatePropagation()
          this.form = form
          this.submitter = event.submitter || null
          this.message = form.dataset.confirm
          this.title = form.dataset.confirmTitle || 'Emin misiniz?'
          this.label = form.dataset.confirmLabel || 'Evet, devam et'
          this.tone = form.dataset.confirmTone || 'danger'
          this.open = true
        },
        true
      )
    },

    accept() {
      const form = this.form
      const submitter = this.submitter
      this.open = false
      this.form = null
      if (!form) return
      form.dataset.confirmed = '1'
      if (typeof form.requestSubmit === 'function') form.requestSubmit(submitter || undefined)
      else form.submit()
    },

    cancel() {
      this.open = false
      this.form = null
    },
  }
}

/** Broken images switch to `data-fallback` (or hide when it is empty). */
function useFallback(img) {
  if (!(img instanceof HTMLImageElement) || !('fallback' in img.dataset) || img.dataset.fellBack)
    return
  img.dataset.fellBack = '1'
  if (img.dataset.fallback) img.src = img.dataset.fallback
  else img.style.visibility = 'hidden'
}

function watchMedia() {
  document.addEventListener('error', (event) => useFallback(event.target), true)
  // Images that failed before this script ran.
  for (const img of document.querySelectorAll('img[data-fallback]'))
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) useFallback(img)
}

/** `<form data-submit-once>`: buttons are disabled after the first submit (double clicks). */
function watchForms() {
  document.addEventListener('submit', (event) => {
    const form = event.target
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-submit-once')) return
    if (event.defaultPrevented) return
    setTimeout(() => {
      for (const button of form.querySelectorAll('button[type="submit"], button:not([type])')) {
        button.disabled = true
        button.setAttribute('aria-busy', 'true')
      }
    }, 0)
  })
  // Coming back through the history cache re-enables them.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return
    for (const button of document.querySelectorAll('form[data-submit-once] button[aria-busy="true"]')) {
      button.disabled = false
      button.removeAttribute('aria-busy')
    }
  })
}

/* ---- x-trap ------------------------------------------------------------------------------
 * `x-trap="open"` keeps keyboard focus inside the element while the expression is true and
 * returns it to the element that had it before. `.inert` hides everything else from assistive
 * technology and the mouse, `.noscroll` locks page scrolling. Nested traps (a confirmation over
 * the inbox) stack: only the newest one handles Tab. A tiny stand-in for @alpinejs/focus.
 */
const traps = []
let scrollLocks = 0

const visible = (el) => el.getClientRects().length > 0 && !el.closest('[inert]')
const focusables = (container) => [...container.querySelectorAll(focusable)].filter(tabbable)

function lockScroll() {
  if (scrollLocks++ > 0) return
  const gap = window.innerWidth - document.documentElement.clientWidth
  document.documentElement.style.overflow = 'hidden'
  if (gap > 0) document.documentElement.style.paddingRight = `${gap}px`
}

function unlockScroll() {
  if (--scrollLocks > 0) return
  scrollLocks = 0
  document.documentElement.style.overflow = ''
  document.documentElement.style.paddingRight = ''
}

/** Marks every element outside `el` (siblings of it and of its ancestors) inert. */
function inertOutside(el) {
  const changed = []
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    for (const sibling of node.parentElement?.children ?? []) {
      if (sibling === node || sibling.inert || ['SCRIPT', 'TEMPLATE'].includes(sibling.tagName)) continue
      sibling.inert = true
      changed.push(sibling)
    }
  }
  return () => changed.forEach((sibling) => (sibling.inert = false))
}

function onTrapKeydown(event) {
  const trap = traps.at(-1)
  if (!trap || event.key !== 'Tab') return
  const items = focusables(trap.el)
  if (!items.length) {
    event.preventDefault()
    trap.el.focus()
    return
  }
  const first = items[0]
  const last = items.at(-1)
  const inside = trap.el.contains(document.activeElement)
  if (event.shiftKey && (document.activeElement === first || !inside)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
    event.preventDefault()
    first.focus()
  }
}

function registerTrap(Alpine) {
  document.addEventListener('keydown', onTrapKeydown)
  Alpine.directive('trap', (el, { expression, modifiers }, { effect, evaluateLater, cleanup }) => {
    const evaluate = evaluateLater(expression)
    let trap = null

    const activate = () => {
      trap = { el, returnTo: document.activeElement, restore: null }
      traps.push(trap)
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
      if (modifiers.includes('noscroll')) lockScroll()
      // Wait until x-show has made the element visible.
      requestAnimationFrame(() => {
        if (!trap) return
        if (modifiers.includes('inert')) trap.restore = inertOutside(el)
        const target =
          [...el.querySelectorAll('[data-autofocus]')].find(visible) || focusables(el)[0] || el
        target.focus({ preventScroll: true })
      })
    }

    const release = () => {
      if (!trap) return
      const current = trap
      trap = null
      traps.splice(traps.indexOf(current), 1)
      current.restore?.()
      if (modifiers.includes('noscroll')) unlockScroll()
      if (current.returnTo instanceof HTMLElement && document.contains(current.returnTo))
        current.returnTo.focus({ preventScroll: true })
    }

    effect(() =>
      evaluate((value) => {
        if (value && !trap) activate()
        else if (!value && trap) release()
      })
    )
    cleanup(release)
  })
}

export function registerUi(Alpine) {
  Alpine.magic('layers', () => layers)
  registerTrap(Alpine)
  watchMedia()
  watchForms()
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { dropdown, tabs, confirmHost }
