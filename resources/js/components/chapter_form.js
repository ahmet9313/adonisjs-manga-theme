export default function chapterForm() {
  return {
    seriesId: '',
    contentType: '',
    searchQuery: '',
    dropdownOpen: false,
    selectedSeriesName: '',
    allSeries: [],
    seriesContentTypes: {},

    // Unified page list: { id, type: 'existing'|'new', url?, file?, preview, name }
    allPages: [],
    imageDragging: false,
    dragStartIndex: null,
    dragOverIndex: null,
    nextId: 0,

    get filteredSeries() {
      if (!this.searchQuery) return this.allSeries
      const q = this.searchQuery.toLowerCase()
      return this.allSeries.filter((s) => s.title.toLowerCase().includes(q))
    },

    selectSeries(s) {
      this.seriesId = s.id
      this.selectedSeriesName = s.title + ' (' + s.typeName + ')'
      this.searchQuery = ''
      this.dropdownOpen = false
      this.contentType = this.seriesContentTypes[this.seriesId] || ''
    },

    handleFileSelect(event) {
      this.addFiles(event.target.files)
      // Reset input so same files can be re-selected
      event.target.value = ''
    },

    addFiles(fileList) {
      for (const file of fileList) {
        if (
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size > 10 * 1024 * 1024
        )
          continue
        const id = this.nextId++
        this.allPages.push({ id, type: 'new', file, name: file.name, preview: null })
        // Grab the proxied reference from the array so Alpine detects changes
        const proxied = this.allPages[this.allPages.length - 1]
        const reader = new FileReader()
        reader.onload = (e) => {
          proxied.preview = e.target.result
        }
        reader.readAsDataURL(file)
      }
    },

    removePage(index) {
      this.allPages.splice(index, 1)
    },

    dragStart(index, event) {
      this.dragStartIndex = index
      event.dataTransfer.effectAllowed = 'move'
    },

    reorderPages(targetIndex) {
      if (this.dragStartIndex === null || this.dragStartIndex === targetIndex) return
      const item = this.allPages.splice(this.dragStartIndex, 1)[0]
      this.allPages.splice(targetIndex, 0, item)
      this.dragStartIndex = null
      this.dragOverIndex = null
    },

    getPageOrderJSON() {
      return JSON.stringify(this.allPages.map((p) => (p.type === 'existing' ? p.url : '__new__')))
    },

    prepareSubmit() {
      // Set new files on the file input via DataTransfer
      const newPages = this.allPages.filter((p) => p.type === 'new')
      if (newPages.length > 0) {
        const dt = new DataTransfer()
        newPages.forEach((p) => dt.items.add(p.file))
        this.$refs.pagesInput.files = dt.files
      } else {
        // Clear file input if no new files
        this.$refs.pagesInput.value = ''
      }
      // page_order hidden input is already bound via :value
      // Form submits naturally
    },

    init() {
      const data = JSON.parse(this.$el.dataset.form)
      this.seriesId = data.seriesId
      this.allSeries = data.series
      this.seriesContentTypes = data.contentTypes
      const existingPagesData = data.pages
      // Load existing pages into the unified list
      existingPagesData.forEach((url) => {
        this.allPages.push({
          id: this.nextId++,
          type: 'existing',
          url: url,
          preview: url,
          name: url.split('/').pop(),
        })
      })

      if (this.seriesId) {
        const found = this.allSeries.find((s) => s.id == this.seriesId)
        if (found) {
          this.selectedSeriesName = found.title + ' (' + found.typeName + ')'
        }
        this.contentType = this.seriesContentTypes[this.seriesId] || ''
      }
    },
  }
}
