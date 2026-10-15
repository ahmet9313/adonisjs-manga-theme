import Alpine from 'alpinejs'
import { registerUi } from './components/ui.js'
import { registerScheme } from './components/theme_switch.js'

/*
 * Every module in components/ lists its Alpine components in `export const components`; they
 * are registered here, so adding a component never needs a change in this file. The chapter
 * form is large and admin-only, so it is loaded on demand.
 */
const modules = import.meta.glob(['./components/*.js', '!./components/chapter_form.js'], {
  eager: true,
})

window.Alpine = Alpine
Alpine.store('account', { unread: Number(document.body.dataset.unread || 0) })
registerUi(Alpine)
registerScheme(Alpine)
for (const module of Object.values(modules))
  for (const [name, factory] of Object.entries(module.components ?? {})) Alpine.data(name, factory)

if (document.querySelector('[x-data="chapterForm"]')) {
  const { default: chapterForm } = await import('./components/chapter_form.js')
  Alpine.data('chapterForm', chapterForm)
}
Alpine.start()
