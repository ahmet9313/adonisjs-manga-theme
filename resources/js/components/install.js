/**
 * Setup wizard (pages/install/icerik.edge): while the sample content loads in the background,
 * `installSeed` polls the job status (data-url) every two seconds, shows the current step and
 * reloads the page once the job has finished, so the step shows its result.
 */
function installSeed() {
  return {
    step: '',
    timer: 0,

    init() {
      this.step = this.$el.querySelector('[x-text]')?.textContent?.trim() || ''
      this.timer = window.setInterval(() => this.poll(), 2000)
    },

    destroy() {
      window.clearInterval(this.timer)
    },

    async poll() {
      try {
        const response = await fetch(this.$el.dataset.url, {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        })
        if (!response.ok) return
        const job = await response.json()
        if (job.step) this.step = job.step
        if (job.state !== 'running') {
          window.clearInterval(this.timer)
          window.location.reload()
        }
      } catch {
        /* The next tick tries again. */
      }
    },
  }
}

/** Alpine components of this module, registered by resources/js/app.js. */
export const components = { installSeed }
