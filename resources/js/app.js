import Alpine from 'alpinejs'
import heroSlider from './components/hero_slider.js'
import navSearch from './components/nav_search.js'
import { filterBar, paginationBar } from './components/catalog.js'
import chapterList from './components/chapter_list.js'
import { bookmarkPage, bookmarkButton } from './components/bookmarks.js'

import multiSelect from './components/multi_select.js'

window.Alpine = Alpine
Alpine.data('multiSelect', multiSelect)
for (const [name, component] of Object.entries({
  heroSlider,
  navSearch,
  filterBar,
  paginationBar,
  chapterList,
  bookmarkPage,
  bookmarkButton,
}))
  Alpine.data(name, component)
if (document.querySelector('[x-data="chapterForm"]')) {
  const { default: chapterForm } = await import('./components/chapter_form.js')
  Alpine.data('chapterForm', chapterForm)
}
Alpine.start()
