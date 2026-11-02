/**
 * Searchable multi-select of related records (series form: genres, authors, artists).
 * Markup: components/ui/multi_select.edge; `data-items` holds [{ id, name, selected }] and
 * `data-id` the base id of the listbox options. The template posts one `<name>[]` hidden input
 * per chosen item.
 *
 * Keyboard (combobox + multi-select listbox): ArrowDown/ArrowUp open the list and move through
 * the options, Home/End jump to the ends, Enter toggles the active option, Backspace in an empty
 * search removes the last chosen item, Escape closes the list. Changes are announced through a
 * polite live region.
 */
export default function multiSelect() {
  return {
    onFill: null,
    open: false,
    search: '',
    items: [],
    active: 0,
    announcement: '',
    baseId: 'ms',

    init() {
      // `this.$el` is the component root only here; in bindings it is the bound element.
      this.baseId = this.$el.dataset.id || this.baseId
      try {
        this.items = JSON.parse(this.$el.dataset.items || '[]')
      } catch {
        this.items = []
      }
      // Records chosen elsewhere ("Otomatik doldur", cover_finder.js): { id, items: [{ id, name }] }.
      // New records (just created) are added to the list.
      this.onFill = (event) => {
        if (event.detail?.id !== this.baseId) return
        for (const { id, name } of event.detail.items || []) {
          let item = this.items.find((entry) => String(entry.id) === String(id))
          if (!item) {
            item = { id, name, selected: false }
            this.items.push(item)
            item = this.items.at(-1)
          }
          item.selected = true
        }
        this.$dispatch('change')
      }
      window.addEventListener('multi-select-add', this.onFill)
    },

    destroy() {
      window.removeEventListener('multi-select-add', this.onFill)
    },

    get filtered() {
      const query = this.search.trim().toLocaleLowerCase('tr')
      if (!query) return this.items
      return this.items.filter((item) => item.name.toLocaleLowerCase('tr').includes(query))
    },

    get selectedItems() {
      return this.items.filter((item) => item.selected)
    },

    optionId(item) {
      return `${this.baseId}-option-${item.id}`
    },

    get activeId() {
      const item = this.filtered[this.active]
      return this.open && item ? this.optionId(item) : ''
    },

    show() {
      if (this.open) return
      this.open = true
      this.active = Math.min(this.active, Math.max(0, this.filtered.length - 1))
      this.reveal()
    },

    close() {
      this.open = false
      this.search = ''
      this.active = 0
    },

    toggle(item) {
      item.selected = !item.selected
      this.announce(item)
    },

    remove(id) {
      const item = this.items.find((entry) => entry.id === id)
      if (!item) return
      item.selected = false
      this.announce(item)
      this.$refs.search?.focus()
    },

    /** Tells screen readers what changed and lets the form know (it tracks unsaved changes). */
    announce(item) {
      const count = this.selectedItems.length
      this.announcement = `${item.name} ${item.selected ? 'seçildi' : 'kaldırıldı'}. ${count} seçili.`
      this.$dispatch('change')
    },

    move(step) {
      const count = this.filtered.length
      if (!count) return
      this.active = (this.active + step + count) % count
      this.reveal()
    },

    reveal() {
      this.$nextTick(() => {
        const id = this.activeId
        if (id) document.getElementById(id)?.scrollIntoView({ block: 'nearest' })
      })
    },

    onInput() {
      this.open = true
      this.active = 0
    },

    onKeydown(event) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          if (this.open) this.move(1)
          else this.show()
          break
        case 'ArrowUp':
          event.preventDefault()
          if (this.open) this.move(-1)
          else this.show()
          break
        case 'Home':
        case 'End':
          if (!this.open || !this.filtered.length) return
          event.preventDefault()
          this.active = event.key === 'Home' ? 0 : this.filtered.length - 1
          this.reveal()
          break
        case 'Enter':
          // Never submits the surrounding form from the search box.
          event.preventDefault()
          if (!this.open) this.show()
          else if (this.filtered[this.active]) this.toggle(this.filtered[this.active])
          break
        case 'Backspace':
          if (this.search || !this.selectedItems.length) return
          this.toggle(this.selectedItems.at(-1))
          break
        case 'Escape':
          if (!this.open) return
          event.preventDefault()
          event.stopPropagation()
          this.close()
          break
        case 'Tab':
          if (this.open) this.close()
          break
      }
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { multiSelect }
