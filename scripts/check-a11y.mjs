/**
 * Accessibility smoke test: runs axe-core (WCAG 2.1 A/AA rules) in headless Chrome/Edge on the
 * given pages, in both colour schemes, at a phone and a desktop width.
 *
 *   npm run test:a11y                                  # http://localhost:3333, public pages
 *   npm run test:a11y -- http://127.0.0.1:3366 --login kullanici:parola --paths /,/ayarlar
 *   npm run test:a11y -- --level moderate             # also fail on moderate issues
 *
 * Only reads pages (GET); logging in creates a normal session. Exit code 1 when an issue of the
 * chosen impact (default: serious and critical) is found.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const option = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}
const baseUrl = (argv.find((arg) => /^https?:\/\//.test(arg)) || process.env.SMOKE_BASE_URL || 'http://localhost:3333').replace(/\/$/, '')
const login = option('login', '')
const impacts = ['minor', 'moderate', 'serious', 'critical']
const level = impacts.indexOf(option('level', 'serious'))
const paths = option(
  'paths',
  '/,/seriler,/series/manga/naruto,/series/manga/naruto/1,/series/novel/sword-art-online/1,/kaydedilenler,/oneriler,/giris,/kayit,/series/manga/bu-seri-yok'
).split(',')
const schemes = option('themes', 'dark,light').split(',')
const widths = option('widths', '390,1280').split(',').map(Number)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const axeSource = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    process.platform === 'win32'
      ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      : '/usr/bin/microsoft-edge',
    process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ]
  return candidates.find((candidate) => candidate && existsSync(candidate))
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

/** Session cookies of a signed-in visitor (form login with the CSRF token). */
async function signIn() {
  const jar = new Map()
  const request = async (path, init = {}) => {
    const response = await fetch(baseUrl + path, {
      ...init,
      redirect: 'manual',
      headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...init.headers },
    })
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';')
      const index = pair.indexOf('=')
      jar.set(pair.slice(0, index), pair.slice(index + 1))
    }
    return response
  }
  const html = await (await request('/giris')).text()
  const token = html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
  const [user, password] = login.split(':')
  await request('/giris', { method: 'POST', body: new URLSearchParams({ _csrf: token, login: user, password }) })
  return jar
}

async function main() {
  const browserPath = findBrowser()
  if (!browserPath) throw new Error('Microsoft Edge, Google Chrome veya Chromium bulunamadı (CHROME_PATH ile belirtin).')
  const cookies = login ? await signIn() : new Map()
  const profile = mkdtempSync(join(tmpdir(), 'mangahub-a11y-'))
  const port = await freePort()
  const browser = spawn(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      ...(process.getuid?.() === 0 || process.env.BROWSER_NO_SANDBOX ? ['--no-sandbox'] : []),
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  )
  let socket
  let failures = 0
  try {
    let target
    for (let attempt = 0; attempt < 40 && !target; attempt++) {
      await delay(250)
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        target = list.find((item) => item.type === 'page')
      } catch {}
    }
    if (!target) throw new Error('Tarayıcıya bağlanılamadı.')
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    let id = 0
    const pending = new Map()
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data)
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message.result)
        pending.delete(message.id)
      }
    })
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const messageId = ++id
        pending.set(messageId, resolve)
        socket.send(JSON.stringify({ id: messageId, method, params }))
      })
    const evaluate = async (expression) =>
      (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value

    const host = new URL(baseUrl).hostname
    for (const [name, value] of cookies) await send('Network.setCookie', { name, value, domain: host, path: '/' })

    for (const scheme of schemes) {
      await send('Network.setCookie', { name: 'theme', value: scheme, domain: host, path: '/' })
      for (const width of widths) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 })
        for (const path of paths) {
          await send('Page.navigate', { url: baseUrl + path })
          for (let attempt = 0; attempt < 40; attempt++) {
            if (await evaluate('document.readyState === "complete"')) break
            await delay(250)
          }
          await delay(600)
          await evaluate(axeSource)
          const violations = await evaluate(`axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
            resultTypes: ['violations'],
          }).then((result) => result.violations.map((item) => ({
            id: item.id, impact: item.impact, help: item.help,
            nodes: item.nodes.slice(0, 3).map((node) => node.target.join(' ')),
            count: item.nodes.length,
          })))`)
          const relevant = (violations || []).filter((item) => impacts.indexOf(item.impact) >= level)
          failures += relevant.length
          const label = `${scheme} ${width}px ${path}`
          if (!relevant.length) {
            console.log(`✓ ${label}`)
            continue
          }
          console.log(`✗ ${label}`)
          for (const item of relevant)
            console.log(`    [${item.impact}] ${item.id} (${item.count}): ${item.help}\n      ${item.nodes.join('\n      ')}`)
        }
      }
    }
  } finally {
    socket?.close()
    browser.kill()
    await delay(250)
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {}
  }
  console.log(failures ? `\n[a11y] ${failures} sorun bulundu.` : '\n[a11y] Sorun bulunmadı.')
  process.exit(failures ? 1 : 0)
}

main().catch((error) => {
  console.error(`[a11y] HATA: ${error.message}`)
  process.exit(1)
})
