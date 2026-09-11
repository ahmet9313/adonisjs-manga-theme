export default function navSearch() {
  return {
    query: '',
    results: [],
    showResults: false,
    loading: false,
    requestId: 0,
    async search() {
      const requestId = ++this.requestId
      if (this.query.trim().length < 2) {
        this.loading = false
        this.results = []
        this.showResults = false
        return
      }

      this.loading = true
      this.showResults = true
      try {
        const response = await fetch('/ara?q=' + encodeURIComponent(this.query.trim()))
        if (!response.ok) throw new Error('Arama isteği başarısız')
        const results = await response.json()
        if (requestId === this.requestId) this.results = results
      } catch {
        if (requestId === this.requestId) this.results = []
      } finally {
        if (requestId === this.requestId) this.loading = false
      }
    },
  }
}
