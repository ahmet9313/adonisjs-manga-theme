import Alpine from 'alpinejs'
import heroSlider from './components/hero_slider.js'
import navSearch from './components/nav_search.js'
import { filterBar, paginationBar } from './components/catalog.js'
import chapterList from './components/chapter_list.js'
import { bookmarkPage, bookmarkButton } from './components/bookmarks.js'
import profileSettings from './components/profile_settings.js'
import roleEditor from './components/role_editor.js'
import themeEditor from './components/theme_editor.js'
import { readingTracker, continueReading, librarySync } from './components/library.js'
import commentSection from './components/comments.js'
import reviewSection from './components/reviews.js'
import {
  accountMenu,
  inbox,
  inventory,
  toasts,
  cosmeticStore,
  cardCollection,
  profileLike,
} from './components/community.js'

import multiSelect from './components/multi_select.js'

window.Alpine = Alpine
Alpine.store('account', { unread: Number(document.body.dataset.unread || 0) })
Alpine.data('multiSelect', multiSelect)
for (const [name, component] of Object.entries({
  heroSlider,
  navSearch,
  filterBar,
  paginationBar,
  chapterList,
  bookmarkPage,
  bookmarkButton,
  profileSettings,
  roleEditor,
  themeEditor,
  readingTracker,
  continueReading,
  librarySync,
  commentSection,
  reviewSection,
  accountMenu,
  inbox,
  inventory,
  toasts,
  cosmeticStore,
  cardCollection,
  profileLike,
}))
  Alpine.data(name, component)
if (document.querySelector('[x-data="chapterForm"]')) {
  const { default: chapterForm } = await import('./components/chapter_form.js')
  Alpine.data('chapterForm', chapterForm)
}
Alpine.start()
