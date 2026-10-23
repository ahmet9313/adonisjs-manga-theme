/*
|--------------------------------------------------------------------------
| Scheduled publishing
|--------------------------------------------------------------------------
|
| Loaded only by the web server (adonisrc.ts → preloads, environment "web"); tests and ace
| commands call `publishDue` themselves. Every minute (config/calendar.ts → intervalMs) drafts
| whose planned time has come are published. The timer is unref'd so it never keeps the process
| alive, a run never overlaps the previous one, and errors are logged instead of thrown.
|
*/

import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import calendar from '#config/calendar'

let running = false

async function tick() {
  if (running) return
  running = true
  try {
    // A site still in the setup wizard may have no tables yet.
    const { default: install } = await import('#services/install_service')
    if (!(await install.isInstalled())) return
    const { default: publishing } = await import('#services/publishing_service')
    await publishing.publishDue(new Date())
  } catch (error) {
    logger.error({ err: error }, 'Planlı yayın denetimi başarısız')
  } finally {
    running = false
  }
}

app.ready(() => {
  const timer = setInterval(tick, calendar.intervalMs)
  timer.unref()
  // A first run shortly after start-up catches anything that came due while the server was down.
  setTimeout(tick, 5_000).unref()
  app.terminating(() => clearInterval(timer))
})
