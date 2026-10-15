import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3333'
const delay = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

const getAvailablePort = () =>
  new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolvePromise(address.port))
    })
  })

function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH,
    process.env.CHROME_PATH,
    process.platform === 'win32'
      ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      : '/usr/bin/microsoft-edge',
    process.platform === 'win32'
      ? 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      : '/usr/bin/google-chrome',
    process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : '/usr/bin/chromium',
  ]
  return candidates.find((candidate) => candidate && existsSync(candidate))
}

async function getDebugTarget(debuggingPort) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)
      const targets = await response.json()
      const page = targets.find((target) => target.type === 'page')
      if (page) return page
    } catch {}
    await delay(250)
  }
  throw new Error('Headless tarayıcı hata ayıklama bağlantısı kurulamadı.')
}

async function main() {
  const browserPath = findBrowser()
  if (!browserPath) throw new Error('Microsoft Edge, Google Chrome veya Chromium bulunamadı.')
  const profileDirectory = mkdtempSync(join(tmpdir(), 'mangahub-mobile-smoke-'))
  const debuggingPort = await getAvailablePort()

  const browser = spawn(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      // Chromium refuses to start as root (containers, CI) unless sandboxing is disabled.
      ...(process.getuid?.() === 0 || process.env.BROWSER_NO_SANDBOX ? ['--no-sandbox'] : []),
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${profileDirectory}`,
      '--window-size=390,844',
      'about:blank',
    ],
    { stdio: 'ignore' }
  )

  let socket
  try {
    const target = await getDebugTarget(debuggingPort)
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await Promise.race([
      new Promise((resolvePromise, reject) => {
        socket.addEventListener('open', resolvePromise, { once: true })
        socket.addEventListener('error', reject, { once: true })
      }),
      delay(10_000).then(() => {
        throw new Error('Tarayıcı WebSocket bağlantısı zaman aşımına uğradı.')
      }),
    ])

    let messageId = 0
    const pending = new Map()
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data)
      if (!message.id || !pending.has(message.id)) return
      const { resolve: resolveRequest, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolveRequest(message.result)
    })

    const send = (method, params = {}) =>
      new Promise((resolveRequest, reject) => {
        const id = ++messageId
        const timeout = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`${method} komutu zaman aşımına uğradı.`))
        }, 15_000)
        pending.set(id, {
          resolve: (result) => {
            clearTimeout(timeout)
            resolveRequest(result)
          },
          reject: (error) => {
            clearTimeout(timeout)
            reject(error)
          },
        })
        socket.send(JSON.stringify({ id, method, params }))
      })

    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    })
    let applicationReady = false
    for (
      let navigationAttempt = 0;
      navigationAttempt < 2 && !applicationReady;
      navigationAttempt++
    ) {
      await send('Page.navigate', { url: baseUrl })
      for (let attempt = 0; attempt < 40; attempt++) {
        const ready = await send('Runtime.evaluate', {
          expression: 'document.readyState === "complete" && Boolean(window.Alpine)',
          returnByValue: true,
        })
        if (ready.result.value) {
          applicationReady = true
          break
        }
        await delay(250)
      }
    }
    if (!applicationReady) throw new Error('Sayfa açıldı ancak CSS/Alpine.js yüklenemedi.')

    const heroEvaluation = await send('Runtime.evaluate', {
      expression: `(async () => {
        const slides = [...document.querySelectorAll('[data-hero-slide]')]
        const nextButton = document.querySelector('[data-hero-next]')
        const visibleSlides = () => slides.filter((slide) => {
          const style = getComputedStyle(slide)
          return style.display !== 'none' && style.visibility !== 'hidden' && slide.getBoundingClientRect().height > 0
        })
        const initialVisible = visibleSlides()
        const initialTitle = initialVisible[0]?.querySelector('[data-hero-title]')?.textContent.trim()
        const banner = slides[0]?.closest('[aria-roledescription="carousel"]')
        const activeArtwork = initialVisible[0]?.querySelector('img')

        nextButton?.click()
        await new Promise((resolve) => setTimeout(resolve, 700))

        const finalVisible = visibleSlides()
        const finalTitle = finalVisible[0]?.querySelector('[data-hero-title]')?.textContent.trim()
        return {
          slideCount: slides.length,
          initialVisibleCount: initialVisible.length,
          finalVisibleCount: finalVisible.length,
          allSlidesLayered: slides.every((slide) => getComputedStyle(slide).position === 'absolute'),
          initialTitle,
          finalTitle,
          changed: Boolean(initialTitle && finalTitle && initialTitle !== finalTitle),
          bannerHeight: Math.round(banner?.getBoundingClientRect().height || 0),
          artworkLoaded: Boolean(activeArtwork?.complete && activeArtwork?.naturalWidth),
          hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })

    if (heroEvaluation.exceptionDetails) {
      throw new Error(
        heroEvaluation.exceptionDetails.exception?.description ||
          heroEvaluation.exceptionDetails.text
      )
    }

    const heroResult = heroEvaluation.result.value
    console.log(JSON.stringify({ heroBanner: heroResult }, null, 2))
    if (
      heroResult.slideCount < 1 ||
      heroResult.initialVisibleCount !== 1 ||
      heroResult.finalVisibleCount !== 1 ||
      !heroResult.allSlidesLayered ||
      (heroResult.slideCount > 1 && !heroResult.changed) ||
      heroResult.bannerHeight < 350 ||
      !heroResult.artworkLoaded ||
      heroResult.hasHorizontalOverflow
    ) {
      throw new Error('Hero banner smoke testi başarısız.')
    }

    const evaluation = await send('Runtime.evaluate', {
      expression: `(async () => {
        const button = document.querySelector('[aria-controls="mobile-navigation"]')
        const menu = document.querySelector('#mobile-navigation')
        const desktopNav = document.querySelector('nav .lg\\\\:flex')
        if (!button || !menu || !desktopNav) {
          return {
            error: 'Navigasyon elemanları bulunamadı.',
            button: Boolean(button),
            menu: Boolean(menu),
            desktopNav: Boolean(desktopNav),
            url: location.href,
            title: document.title,
            body: document.body?.innerText.slice(0, 120),
          }
        }
        const before = getComputedStyle(menu).display
        button.click()
        await new Promise((resolve) => setTimeout(resolve, 400))
        const searchInput = menu.querySelector('#mobile-series-search')
        searchInput.value = 'Naruto'
        searchInput.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 900))
        return {
          viewport: window.innerWidth,
          before,
          after: getComputedStyle(menu).display,
          expanded: button.getAttribute('aria-expanded'),
          desktopNav: getComputedStyle(desktopNav).display,
          hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
          hasMobileSearch: Boolean(searchInput),
          searchResult: menu.querySelector('a[href="/series/manga/naruto"]')?.getAttribute('href'),
        }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })

    if (evaluation.exceptionDetails) {
      throw new Error(
        evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text
      )
    }

    const result = evaluation.result.value
    const mobilePassed =
      !result.error &&
      result.before === 'none' &&
      result.after !== 'none' &&
      result.expanded === 'true' &&
      result.desktopNav === 'none' &&
      !result.hasHorizontalOverflow &&
      result.hasMobileSearch &&
      result.searchResult === '/series/manga/naruto'

    console.log(JSON.stringify(result, null, 2))
    if (!mobilePassed) throw new Error('Mobil navigasyon smoke testi başarısız.')

    await send('Emulation.setDeviceMetricsOverride', {
      width: 934,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await delay(200)
    const zoomEvaluation = await send('Runtime.evaluate', {
      expression: `(() => {
        const button = document.querySelector('[aria-controls="mobile-navigation"]')
        const desktopNav = document.querySelector('nav .lg\\\\:flex')
        return {
          viewport: window.innerWidth,
          mobileButton: getComputedStyle(button).display,
          desktopNav: getComputedStyle(desktopNav).display,
          hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        }
      })()`,
      returnByValue: true,
    })
    const zoomResult = zoomEvaluation.result.value
    console.log(JSON.stringify({ highZoomLayout: zoomResult }, null, 2))
    if (
      zoomResult.mobileButton === 'none' ||
      zoomResult.desktopNav !== 'none' ||
      zoomResult.hasHorizontalOverflow
    ) {
      throw new Error('Yüksek zoom navigasyon testi başarısız.')
    }

    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await delay(200)
    const desktopEvaluation = await send('Runtime.evaluate', {
      expression: `(() => {
        const button = document.querySelector('[aria-controls="mobile-navigation"]')
        const menu = document.querySelector('#mobile-navigation')
        const desktopNav = document.querySelector('nav .lg\\\\:flex')
        return {
          viewport: window.innerWidth,
          mobileButton: getComputedStyle(button).display,
          mobileMenu: getComputedStyle(menu).display,
          expanded: button.getAttribute('aria-expanded'),
          desktopNav: getComputedStyle(desktopNav).display,
          hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        }
      })()`,
      returnByValue: true,
    })
    const desktopResult = desktopEvaluation.result.value
    console.log(JSON.stringify({ desktopLayout: desktopResult }, null, 2))
    if (
      desktopResult.mobileButton !== 'none' ||
      desktopResult.mobileMenu !== 'none' ||
      desktopResult.expanded !== 'false' ||
      desktopResult.desktopNav === 'none' ||
      desktopResult.hasHorizontalOverflow
    ) {
      throw new Error('Masaüstü navigasyon testi başarısız.')
    }
    const visit = async (path) => {
      await send('Page.navigate', { url: new URL(path, baseUrl).href })
      for (let attempt = 0; attempt < 40; attempt++) {
        const ready = await send('Runtime.evaluate', {
          expression: 'document.readyState === "complete" && Boolean(window.Alpine)',
          returnByValue: true,
        })
        if (ready.result.value) return
        await delay(250)
      }
      throw new Error(`${path} sayfası yüklenemedi.`)
    }
    for (const width of [390, 1280]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 600,
      })
      for (const path of [
        '/seriler',
        '/series/manga/naruto',
        '/series/manga/naruto/1',
        '/series/novel/sword-art-online/1',
        '/kaydedilenler',
        '/giris',
        '/kayit',
      ]) {
        await visit(path)
        const check = await send('Runtime.evaluate', {
          expression: `({ title: document.title, overflow: document.documentElement.scrollWidth > innerWidth, error: document.body.innerText.includes('E_RUNTIME_EXCEPTION'), brokenImages: [...document.images].filter(img => img.getBoundingClientRect().width && img.complete && !img.naturalWidth).map(img => img.src) })`,
          returnByValue: true,
        })
        const value = check.result.value
        console.log(JSON.stringify({ page: path, width, ...value }))
        if (value.error || value.overflow || value.brokenImages.length)
          throw new Error(`${path} görünüm kontrolü başarısız.`)
      }
    }
    await visit('/series/manga/naruto')
    const bookmark = await send('Runtime.evaluate', {
      expression: `(async () => {
        const button = document.querySelector('[data-bookmark]')
        button.click()
        await new Promise(resolve => setTimeout(resolve, 100))
        return button.getAttribute('aria-pressed')
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (bookmark.result.value !== 'true') throw new Error('Seri kaydetme düğmesi çalışmadı.')
    await visit('/kaydedilenler')
    const saved = await send('Runtime.evaluate', {
      expression: `(async () => {
        await new Promise(resolve => setTimeout(resolve, 300))
        const cover = document.querySelector('a[href="/series/manga/naruto"] img')
        return Boolean(cover?.complete && cover.naturalWidth)
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (!saved.result.value) throw new Error('Kaydedilen seri kapağı yüklenemedi.')
    console.log('[mobile-nav] Navigasyon, katalog, okuyucu ve kaydetme testleri başarılı.')

    await send('Browser.close')
  } finally {
    if (socket?.readyState === WebSocket.OPEN) socket.close()
    if (!browser.killed) browser.kill()
    await delay(250)
    try {
      rmSync(profileDirectory, { recursive: true, force: true })
    } catch {}
  }
}

main().catch((error) => {
  console.error(`[mobile-nav] HATA: ${error.message}`)
  process.exitCode = 1
})
