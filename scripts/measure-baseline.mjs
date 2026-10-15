/**
 * Read-only performance snapshot of a running MangaHub server (OPTIMIZATION_PLAN Faz 1).
 *
 *   node scripts/measure-baseline.mjs [http://localhost:3333] [--label once] [--runs 20]
 *
 * Only sends anonymous GET requests: response time (median/p95), HTML size, gzip size of the
 * page's JS/CSS bundles, cache headers of assets/images and the status of an unknown URL.
 * Results go to tmp/baseline-<label>.json (tmp/ is not committed).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const argv = process.argv.slice(2)
const option = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}
const base = (argv.find((arg) => /^https?:\/\//.test(arg)) || 'http://localhost:3333').replace(
  /\/$/,
  ''
)
const label = option('label', 'baseline')
const runs = Math.max(3, Number(option('runs', 20)) || 20)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function get(path) {
  const started = performance.now()
  const response = await fetch(base + path, { redirect: 'manual' })
  const body = Buffer.from(await response.arrayBuffer())
  return { status: response.status, ms: performance.now() - started, body, headers: response.headers }
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

function firstLink(html, pattern) {
  for (const match of html.matchAll(/href="([^"]+)"/g)) if (pattern.test(match[1])) return match[1]
  return null
}

async function timePage(name, path) {
  await get(path)
  await get(path)
  const times = []
  let last
  for (let index = 0; index < runs; index++) {
    last = await get(path)
    times.push(last.ms)
  }
  const html = last.body.toString('utf8')
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])
  return {
    name,
    path,
    status: last.status,
    medianMs: Number(percentile(times, 50).toFixed(1)),
    p95Ms: Number(percentile(times, 95).toFixed(1)),
    htmlBytes: last.body.length,
    htmlGzipBytes: gzipSync(last.body).length,
    imgTags: (html.match(/<img\b/g) || []).length,
    assets: [...new Set(assets)],
    html,
  }
}

async function main() {
  const home = await get('/')
  if (home.status !== 200) throw new Error(`${base}/ yanıtı ${home.status}; sunucu çalışıyor mu?`)
  const homeHtml = home.body.toString('utf8')
  const seriesPath = firstLink(homeHtml, /^\/series\/[^/]+\/[^/]+$/)
  const seriesHtml = seriesPath ? (await get(seriesPath)).body.toString('utf8') : ''
  const chapterPath = seriesPath
    ? firstLink(seriesHtml, new RegExp(`^${seriesPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.+`))
    : null

  const pages = [
    ['Ana sayfa', '/'],
    ['Katalog', '/seriler'],
    ['Seri detay', seriesPath],
    ['Okuyucu', chapterPath],
    ['Arama (JSON/HTML)', '/ara?q=na'],
    ['Öneriler (misafir)', '/oneriler'],
    ['Kozmetik (efektler)', '/kozmetik/efektler'],
  ].filter(([, path]) => path)

  const results = []
  for (const [name, path] of pages) results.push(await timePage(name, path))

  const assetSizes = {}
  for (const path of new Set(results.flatMap((page) => page.assets))) {
    const asset = await get(path)
    assetSizes[path] = {
      bytes: asset.body.length,
      gzipBytes: gzipSync(asset.body).length,
      cacheControl: asset.headers.get('cache-control'),
    }
  }

  const firstImage = /<img[^>]+src="(\/content\/[^"]+)"/.exec(results[0].html)?.[1]
  const image = firstImage ? await get(firstImage) : null
  const missing = await get('/yok-boyle-bir-sayfa-olcum')

  const report = {
    label,
    base,
    takenAt: new Date().toISOString(),
    runs,
    node: process.version,
    pages: results.map(({ html: _html, ...page }) => ({
      ...page,
      jsGzipBytes: page.assets
        .filter((path) => path.endsWith('.js'))
        .reduce((sum, path) => sum + assetSizes[path].gzipBytes, 0),
      cssGzipBytes: page.assets
        .filter((path) => path.endsWith('.css'))
        .reduce((sum, path) => sum + assetSizes[path].gzipBytes, 0),
    })),
    assets: assetSizes,
    imageSample: image
      ? { path: firstImage, status: image.status, cacheControl: image.headers.get('cache-control') }
      : null,
    unknownUrl: { status: missing.status, bytes: missing.body.length },
  }

  const out = resolve(root, 'tmp', `baseline-${label}.json`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(report, null, 2))

  console.table(
    report.pages.map((page) => ({
      sayfa: page.name,
      durum: page.status,
      medyanMs: page.medianMs,
      p95Ms: page.p95Ms,
      htmlKB: (page.htmlGzipBytes / 1024).toFixed(1) + ' gz',
      jsKB: (page.jsGzipBytes / 1024).toFixed(1) + ' gz',
      cssKB: (page.cssGzipBytes / 1024).toFixed(1) + ' gz',
      img: page.imgTags,
    }))
  )
  console.log('Görsel önbellek başlığı:', report.imageSample?.cacheControl ?? '(yok)')
  console.log(
    'Varlık önbellek başlığı:',
    Object.values(assetSizes)[0]?.cacheControl ?? '(yok)'
  )
  console.log('Bilinmeyen adres durumu:', report.unknownUrl.status)
  console.log('Rapor:', out)
}

main().catch((error) => {
  console.error(`[ölçüm] HATA: ${error.message}`)
  process.exitCode = 1
})
