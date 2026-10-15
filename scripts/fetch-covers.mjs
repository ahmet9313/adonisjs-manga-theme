/**
 * Downloads real cover art for the demo series from the public AniList API and points the
 * database at it:
 *
 *   npm run covers:fetch              # all series
 *   npm run covers:fetch -- --dry     # only show the matches
 *   npm run covers:fetch -- --restore # back to the generated covers
 *   npm run covers:fetch -- --no-titles # keep the existing alternative titles
 *
 * Alternative titles (English, romaji, native and AniList synonyms) are merged into each matched
 * series so the "alt başlıklar" under the title and the search are real.
 *
 * Files go to <content root>/<type>/<slug>/cover.jpg (and banner.jpg when AniList has a wide
 * banner), so they stay out of git like every other generated content. Series AniList cannot
 * match keep their generated cover. The artwork belongs to its publishers and is meant for local
 * testing only; do not publish it. Needs network access; the demo data works without it.
 * (Kept outside `ace`, see promote-admin.mjs.)
 */
import '@poppinss/ts-exec'
import 'reflect-metadata'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Ignitor } from '@adonisjs/core'

const args = new Set(process.argv.slice(2))
const dry = args.has('--dry')
const restore = args.has('--restore')
const mergeTitles = !args.has('--no-titles')

const APP_ROOT = new URL('../', import.meta.url)
const importer = (filePath) =>
  filePath.startsWith('./') || filePath.startsWith('../')
    ? import(new URL(filePath, APP_ROOT).href)
    : import(filePath)

const app = new Ignitor(APP_ROOT, { importer }).createApp('console')
app.booting(async () => {
  await import('#start/env')
})
await app.init()
await app.boot()

const API = 'https://graphql.anilist.co'
const QUERY = `query ($search: String) {
  Page(perPage: 8) {
    media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
      id format countryOfOrigin popularity synonyms bannerImage
      title { romaji english native }
      coverImage { extraLarge large }
    }
  }
}`

const normalize = (text) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

function similarity(a, b) {
  const x = normalize(a)
  const y = normalize(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.replaceAll(' ', '') === y.replaceAll(' ', '')) return 0.97
  const left = new Set(x.split(' '))
  const right = new Set(y.split(' '))
  const shared = [...left].filter((word) => right.has(word)).length
  const jaccard = shared / (left.size + right.size - shared)
  // "Demon Slayer" inside "Demon Slayer: Kimetsu no Yaiba": every word of the shorter title
  // appears in the longer one, and the shorter title has at least two words.
  const [short, long] = left.size <= right.size ? [left, right] : [right, left]
  const contained = short.size >= 2 && [...short].every((word) => long.has(word)) ? 0.8 : 0
  return Math.max(jaccard, contained)
}

/** Series AniList does not find by title: slug -> AniList media id. */
const OVERRIDES = { windbreaker: 86099 }

const BY_ID = `query ($id: Int) {
  Media(id: $id, type: MANGA) {
    id format countryOfOrigin popularity synonyms bannerImage
    title { romaji english native }
    coverImage { extraLarge large }
  }
}`

const origin = { manga: 'JP', manhwa: 'KR', webtoon: 'KR', manhua: 'CN', novel: 'JP' }

function pick(series, candidates) {
  let best = null
  for (const media of candidates) {
    const names = [
      media.title.romaji,
      media.title.english,
      media.title.native,
      ...(media.synonyms || []),
    ]
    const match = Math.max(...names.map((name) => similarity(series.title, name)))
    const score =
      match * 10 +
      (media.countryOfOrigin === origin[series.type] ? 1.5 : 0) +
      ((media.format === 'NOVEL') === (series.type === 'novel') ? 1.5 : -1.5) +
      Math.log10(Math.max(media.popularity, 10)) / 10
    if (match >= 0.6 && (!best || score > best.score)) best = { media, score, match }
  }
  return best
}

async function search(title, id = null) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify(
        id ? { query: BY_ID, variables: { id } } : { query: QUERY, variables: { search: title } }
      ),
    })
    if (response.status === 429) {
      const wait = Number(response.headers.get('retry-after') || 30)
      console.log(`  (hız sınırı, ${wait} sn bekleniyor)`)
      await new Promise((resolve) => setTimeout(resolve, wait * 1000))
      continue
    }
    if (!response.ok) throw new Error(`AniList ${response.status}`)
    const data = await response.json()
    return id ? [data.data?.Media].filter(Boolean) : (data.data?.Page?.media ?? [])
  }
  throw new Error('AniList hız sınırı aşıldı')
}

/** Existing alternative titles plus AniList's, de-duplicated and kept short. */
function mergeAlternatives(series, media) {
  const own = normalize(series.title)
  const seen = new Set([own])
  const result = []
  const existing = JSON.parse(series.alternative_titles || '[]')
  for (const name of [
    ...existing,
    media.title.english,
    media.title.romaji,
    media.title.native,
    ...(media.synonyms || []),
  ]) {
    const text = String(name || '').trim()
    const key = normalize(text)
    if (!text || text.length > 60 || !key || seen.has(key)) continue
    seen.add(key)
    result.push(text)
  }
  // Keep the originals first, then at most four new ones.
  return result.slice(0, existing.length + 4)
}

async function download(url, target) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} → ${response.status}`)
  const type = response.headers.get('content-type') || ''
  if (!type.startsWith('image/')) throw new Error(`${url} görsel değil (${type})`)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, Buffer.from(await response.arrayBuffer()))
}

try {
  const { default: db } = await import('@adonisjs/lucid/services/db')
  const { default: contentConfig } = await import('#config/content')
  const rows = await db
    .from('series')
    .join('content_types', 'content_types.id', 'series.content_type_id')
    .select(
      'series.id',
      'series.title',
      'series.slug',
      'series.cover_image',
      'series.banner_image',
      'series.alternative_titles',
      'content_types.slug as type'
    )
    .orderBy('series.id')

  let changed = 0
  for (const series of rows) {
    const dir = join(contentConfig.root, series.type, series.slug)
    const publicPath = (file) => `/content/${series.type}/${series.slug}/${file}`

    if (restore) {
      if (existsSync(join(dir, 'cover.svg')) && series.cover_image !== publicPath('cover.svg')) {
        await db
          .from('series')
          .where('id', series.id)
          .update({ cover_image: publicPath('cover.svg') })
        await db
          .from('cards')
          .where({ series_id: series.id, image: series.cover_image })
          .update({ image: publicPath('cover.svg') })
        if (existsSync(join(dir, 'banner.svg')) && series.banner_image)
          await db
            .from('series')
            .where('id', series.id)
            .update({ banner_image: publicPath('banner.svg') })
        changed++
        console.log(`↩ ${series.title}`)
      }
      continue
    }

    let found = null
    if (OVERRIDES[series.slug]) {
      const [media] = await search('', OVERRIDES[series.slug])
      if (media) found = { media, match: 1 }
    }
    found ??= pick(series, await search(series.title))
    // Not found (or only loosely): try the alternative titles, e.g. the Korean original.
    if (!found || found.match < 0.9) {
      const alternatives = JSON.parse(series.alternative_titles || '[]').filter(
        (name) => !/[ğüşıöçĞÜŞİÖÇ]/.test(name)
      )
      for (const name of alternatives.slice(0, 2)) {
        await new Promise((resolve) => setTimeout(resolve, 800))
        const retry = pick(series, await search(name))
        if (retry && (!found || retry.match > found.match)) found = retry
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 800))
    if (!found) {
      console.log(`✗ ${series.title}: eşleşme yok (oluşturulmuş kapak kalıyor)`)
      continue
    }
    const { media } = found
    console.log(
      `✓ ${series.title} → ${media.title.english || media.title.romaji} (AniList #${media.id}, benzerlik ${found.match.toFixed(2)})`
    )
    if (dry) continue

    const cover = publicPath('cover.jpg')
    if (!existsSync(join(dir, 'cover.jpg')))
      await download(media.coverImage.extraLarge || media.coverImage.large, join(dir, 'cover.jpg'))
    const update = { cover_image: cover }
    if (mergeTitles) update.alternative_titles = JSON.stringify(mergeAlternatives(series, media))
    // A wide banner only for series that already show one in the hero/series header.
    if (series.banner_image && media.bannerImage) {
      if (!existsSync(join(dir, 'banner.jpg')))
        await download(media.bannerImage, join(dir, 'banner.jpg'))
      update.banner_image = publicPath('banner.jpg')
    }
    await db.from('series').where('id', series.id).update(update)
    // Collectible cards made from the old cover follow it.
    if (series.cover_image && series.cover_image !== cover)
      await db
        .from('cards')
        .where({ series_id: series.id, image: series.cover_image })
        .update({ image: cover })
    changed++
  }
  console.log(
    dry
      ? '\nKuru çalıştırma: hiçbir şey değiştirilmedi.'
      : `\n${changed} seri güncellendi. Kapaklar yalnızca yerel test içindir; yayımlamayın.`
  )
} finally {
  await app.terminate()
}
