export default function multiSelect() {
  return {
    open: false,
    search: '',
    items: [],
    init() {
      this.items = JSON.parse(this.$el.dataset.items)
    },
    get filtered() {
      return this.items.filter((item) =>
        item.name.toLocaleLowerCase('tr').includes(this.search.toLocaleLowerCase('tr'))
      )
    },
    get selectedItems() {
      return this.items.filter((item) => item.selected)
    },
    toggle(item) {
      item.selected = !item.selected
    },
    remove(id) {
      const item = this.items.find((entry) => entry.id === id)
      if (item) item.selected = false
    },
  }
}
