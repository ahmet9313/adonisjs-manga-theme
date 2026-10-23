import Alpine from 'alpinejs'
import { registerUi } from './components/ui.js'
import { registerScheme } from './components/theme_switch.js'

/*
 * Every module in components/ lists its Alpine components in `export const components`; they
 * are registered here, so adding a component never needs a change in this file.
 * Modules used only in the admin panel are separate chunks loaded on `<body data-area="admin">`,
 * so readers never download them; Vite needs literal globs, so an admin-only module is listed
 * twice: excluded from the eager glob and included in `lazyModules`. The chapter form is large,
 * so it is loaded only on its own page.
 */
const modules = import.meta.glob(
  [
    './components/*.js',
    '!./components/chapter_form.js',
    '!./components/admin_community.js',
    '!./components/admin_shell.js',
    '!./components/brand_image.js',
    '!./components/cover_finder.js',
    '!./components/markdown_editor.js',
    '!./components/multi_select.js',
    '!./components/role_editor.js',
    '!./components/tag_input.js',
    '!./components/theme_editor.js',
  ],
  { eager: true }
)
const lazyModules = import.meta.glob([
  './components/admin_community.js',
  './components/admin_shell.js',
  './components/brand_image.js',
  './components/cover_finder.js',
  './components/markdown_editor.js',
  './components/multi_select.js',
  './components/role_editor.js',
  './components/tag_input.js',
  './components/theme_editor.js',
])

const register = (module) => {
  for (const [name, factory] of Object.entries(module.components ?? {})) Alpine.data(name, factory)
}

window.Alpine = Alpine
Alpine.store('account', { unread: Number(document.body.dataset.unread || 0) })
registerUi(Alpine)
registerScheme(Alpine)
for (const module of Object.values(modules)) register(module)

if (document.body.dataset.area === 'admin')
  for (const module of await Promise.all(Object.values(lazyModules).map((load) => load())))
    register(module)

if (document.querySelector('[x-data="chapterForm"]')) {
  const { default: chapterForm } = await import('./components/chapter_form.js')
  Alpine.data('chapterForm', chapterForm)
}
Alpine.start()
