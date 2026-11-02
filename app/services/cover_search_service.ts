import covers, { type CoverSource } from '#config/covers'
import type site from '#config/site'
import { imageTypeOf } from '#services/upload_service'
import { type ContentFormat } from '#config/site'

/**
 * Cover/banner candidates and series details from AniList, MyAnimeList, Kitsu and IMDb (video
 * series only) for the admin series form ("Otomatik doldur").
 *
 * Ranking follows how manga sites choose a cover:
 * 1. the right work: the title (or an alternative title) matches one of the work's names;
 * 2. the right medium: a novel gets the novel's cover, an anime its key visual, a manga/manhwa
 *    the comic's (adaptations share names but not covers), and the country fits the content type
 *    (manga → Japan, manhwa/webtoon → Korea, manhua → China);
 * 3. the right edition: the year is close to the series' year;
 * 4. the official art at the best quality: large portrait key art before small images.
 * Banners (wide art from AniList and Kitsu) are returned separately.
 *
 * `workDetails` then reads one work in full (description, other titles, genres, authors and
 * artists, year, status, age rating, images) so the form can be filled from it.
 */

export type CoverKind = 'cover' | 'banner'
export type Medium = 'comic' | 'novel' | 'anime' | 'other'

export interface CoverCandidate {
  id: string
  source: CoverSource
  sourceLabel: string
  /** The work at its source (`workDetails(source, ref)`). */
  ref: string
  kind: CoverKind
  /** Full image and a smaller one for the result grid (both on covers.imageHosts). */
  image: string
  thumb: string
  width: number | null
  height: number | null
  /** The work's name at the source and a short line such as "Manhwa · 2018 · Ana kapak". */
  title: string
  detail: string
  /** Page of the work at the source. */
  link: string
  /** 0–1 similarity of the best matching name. */
  match: number
  score: number
}

export interface CoverSearch {
  query: string
  alternatives?: string[]
  format: ContentFormat
  /** Content type slug (manga, manhwa …), used for the country of origin. */
  type?: string
  year?: number | null
}

export interface CoverResults {
  covers: CoverCandidate[]
  banners: CoverCandidate[]
  failures: { source: CoverSource; label: string }[]
}

/** One work as the form can use it; names are the source's own (genres in English). */
export interface WorkDetails {
  source: CoverSource
  sourceLabel: string
  link: string
  title: string
  alternatives: string[]
  /** Plain text; the sources write in English. */
  description: string | null
  year: number | null
  status: (typeof site.statuses)[number] | null
  ageRating: (typeof site.ageRatings)[number] | null
  medium: Medium
  country: string | null
  genres: string[]
  /** Finer labels (AniList tags); only used when they match one of this site's genres. */
  tags: string[]
  authors: string[]
  artists: string[]
  cover: string | null
  banner: string | null
}

export type Fetcher = typeof fetch

/** A work found by a search, before its images are scored. */
export interface Work {
  ref: string
  names: string[]
  medium: Medium
  country: string | null
  year: number | null
  link: string
  label: string
  popularity: number
  images: {
    kind: CoverKind
    image: string
    thumb: string
    width: number | null
    height: number | null
    note: string
    /** Added to the score (0 for the main cover). */
    bonus: number
  }[]
}

interface Provider {
  search(fetcher: Fetcher, query: string, search: CoverSearch): Promise<Work[]>
  details(fetcher: Fetcher, ref: string, format: ContentFormat): Promise<WorkDetails>
}

const countries: Record<string, string> = {
  manga: 'JP',
  manhwa: 'KR',
  webtoon: 'KR',
  manhua: 'CN',
}

export const normalize = (text: unknown) =>
  String(text ?? '')
    .toLocaleLowerCase('tr')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** 1 for the same name, ~0.97 for the same letters, word overlap otherwise. */
export function similarity(a: unknown, b: unknown): number {
  const x = normalize(a)
  const y = normalize(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.replaceAll(' ', '') === y.replaceAll(' ', '')) return 0.97
  const left = new Set(x.split(' '))
  const right = new Set(y.split(' '))
  const shared = [...left].filter((word) => right.has(word)).length
  const jaccard = shared / (left.size + right.size - shared)
  // "Demon Slayer" inside "Demon Slayer: Kimetsu no Yaiba": every word of the shorter name is in
  // the longer one and the shorter name has at least two words.
  const [short, long] = left.size <= right.size ? [left, right] : [right, left]
  const contained = short.size >= 2 && [...short].every((word) => long.has(word)) ? 0.85 : 0
  return Math.max(jaccard, contained, subtitled(a, b), subtitled(b, a))
}

/** "Frieren" for "Frieren: Beyond Journey's End": the name followed by a subtitle mark. */
function subtitled(name: unknown, full: unknown) {
  const short = String(name ?? '')
    .trim()
    .toLocaleLowerCase('tr')
  const long = String(full ?? '')
    .trim()
    .toLocaleLowerCase('tr')
  if (!short || long.length <= short.length || !long.startsWith(short)) return 0
  return /^\s*[:\-–—~(]/.test(long.slice(short.length)) ? 0.8 : 0
}

/** "Solo Leveling: Ragnarok" for "Solo Leveling" passes, "Peach Girl" for "Peach" does not. */
const MIN_MATCH = 0.6

function wantedMedium(format: ContentFormat): Medium {
  return format === 'video' ? 'anime' : format === 'text' ? 'novel' : 'comic'
}

function yearOf(value: unknown): number | null {
  const year = Number.parseInt(String(value ?? '').match(/\d{4}/)?.[0] || '', 10)
  return Number.isFinite(year) && year > 1900 ? year : null
}

const latin = (name: string) => /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(name)

function score(work: Work, match: number, search: CoverSearch, source: CoverSource) {
  const wanted = wantedMedium(search.format)
  const country = search.type ? countries[search.type] : undefined
  const year = search.year || null
  let total = match * 50
  total += work.medium === wanted ? 15 : work.medium === 'other' ? 0 : -20
  if (country && work.country) total += work.country === country ? 8 : -4
  if (year && work.year) {
    const gap = Math.abs(year - work.year)
    total += gap <= 1 ? 6 : gap <= 3 ? 2 : -4
  }
  total += covers.sources[source].trust
  total += Math.log10(Math.max(work.popularity, 1)) / 2
  return total
}

function quality(image: Work['images'][number], source: CoverSource) {
  const width = image.width || covers.sources[source].width
  let total = (Math.min(width, 1200) / 1200) * 12
  if (image.kind === 'cover' && image.width && image.height) {
    const ratio = image.height / image.width
    total += ratio >= 1.3 && ratio <= 1.65 ? 3 : -3
  }
  return total
}

async function request(fetcher: Fetcher, url: string, init: RequestInit = {}) {
  const response = await fetcher(url, {
    ...init,
    redirect: 'follow',
    signal: AbortSignal.timeout(covers.timeoutMs),
    headers: { 'user-agent': covers.userAgent, 'accept-language': 'en', ...init.headers },
  })
  if (!response.ok) throw new Error(`${url} → ${response.status}`)
  return response
}

async function getJson(fetcher: Fetcher, url: string, init: RequestInit = {}): Promise<any> {
  const response = await request(fetcher, url, {
    ...init,
    headers: { accept: 'application/json', ...init.headers },
  })
  // A site that is down may answer with an HTML maintenance page and status 200.
  const type = response.headers.get('content-type') || ''
  if (!type.includes('json')) throw new Error(`${url} → ${type}`)
  return response.json()
}

const entities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
}

/** HTML or markdown-ish source text → plain paragraphs, without "(Source: …)" credits. */
export function plainText(value: unknown): string | null {
  const text = String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code: string) => {
      if (code[0] !== '#') return entities[code.toLowerCase()] ?? all
      const number =
        code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : +code.slice(1)
      return Number.isFinite(number) ? String.fromCodePoint(number) : all
    })
    .replace(/\[(?:Written by|Source:)[^\]]*\]/gi, '')
    .replace(/\((?:Source|Kaynak):[^)]*\)/gi, '')
    .replace(/__|~!|!~/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || null
}

function unique(list: (string | null | undefined)[], skip: string[] = []) {
  const seen = new Set(skip.map(normalize))
  const result: string[] = []
  for (const value of list) {
    const text = String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ')
    const key = normalize(text)
    if (!text || !key || text.length > 80 || text.includes(',') || seen.has(key)) continue
    seen.add(key)
    result.push(text)
  }
  return result
}

/** Ratings come in many systems; the strictest that applies wins. */
function ageFrom({ adult = false, genres = [] as string[], rating = '' }) {
  const all = genres.map((genre) => genre.toLowerCase())
  const text = rating.toLowerCase()
  if (
    adult ||
    all.some((g) => ['hentai', 'erotica'].includes(g)) ||
    /\b(rx|r18|hentai)\b/.test(text)
  )
    return '18+'
  if (all.includes('ecchi') || /\br\+|\br\b|17\+/.test(text)) return '16+'
  if (/pg-13|teens 13/.test(text)) return '13+'
  if (/\bg\b|\bpg\b|all ages|children/.test(text)) return '7+'
  return null
}

const statusMap: Record<string, (typeof site.statuses)[number]> = {
  'finished': 'Tamamlandı',
  'finished airing': 'Tamamlandı',
  'completed': 'Tamamlandı',
  'releasing': 'Devam Ediyor',
  'publishing': 'Devam Ediyor',
  'currently airing': 'Devam Ediyor',
  'current': 'Devam Ediyor',
  'hiatus': 'Devam Ediyor',
  'on hiatus': 'Devam Ediyor',
  'not_yet_released': 'Devam Ediyor',
  'not yet published': 'Devam Ediyor',
  'not yet aired': 'Devam Ediyor',
  'upcoming': 'Devam Ediyor',
  'unreleased': 'Devam Ediyor',
  'tba': 'Devam Ediyor',
  'cancelled': 'Bırakıldı',
  'discontinued': 'Bırakıldı',
}
const statusOf = (value: unknown) => statusMap[String(value ?? '').toLowerCase()] ?? null

/** "Kishimoto, Masashi" (MyAnimeList) → "Masashi Kishimoto". */
const personName = (name: string) => {
  const parts = name.split(',').map((part) => part.trim())
  return parts.length === 2 && parts[1] ? `${parts[1]} ${parts[0]}` : name.trim()
}

/* ---------------------------------------------------------------- AniList */

const ANILIST_SEARCH = `query ($search: String, $type: MediaType) {
  Page(perPage: 6) {
    media(search: $search, type: $type, sort: SEARCH_MATCH) {
      id siteUrl format countryOfOrigin popularity synonyms bannerImage
      startDate { year }
      title { romaji english native }
      coverImage { extraLarge large }
    }
  }
}`

const ANILIST_DETAILS = `query ($id: Int) {
  Media(id: $id) {
    id siteUrl type format countryOfOrigin isAdult status synonyms genres bannerImage
    description(asHtml: false)
    startDate { year }
    title { romaji english native }
    coverImage { extraLarge }
    tags { name rank isMediaSpoiler }
    staff(perPage: 25, sort: [RELEVANCE]) { edges { role node { name { full } } } }
    studios(isMain: true) { nodes { name } }
  }
}`

const anilistFormats: Record<string, string> = {
  NOVEL: 'Novel',
  ONE_SHOT: 'Tek bölüm',
  TV: 'TV',
  TV_SHORT: 'TV kısa',
  MOVIE: 'Film',
  SPECIAL: 'Özel',
  OVA: 'OVA',
  ONA: 'ONA',
}

function anilistMedium(media: any): Medium {
  if (media.type === 'ANIME') return 'anime'
  if (media.format === 'NOVEL') return 'novel'
  return ['MANGA', 'ONE_SHOT'].includes(media.format) ? 'comic' : 'other'
}

// AniList calls Korean and Chinese comics "MANGA" too.
const anilistLabel = (media: any) =>
  media.format === 'MANGA'
    ? { KR: 'Manhwa', CN: 'Manhua', TW: 'Manhua' }[media.countryOfOrigin as string] || 'Manga'
    : anilistFormats[media.format] || ''

const anilistPost = (fetcher: Fetcher, query: string, variables: object) =>
  getJson(fetcher, 'https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })

const anilist: Provider = {
  async search(fetcher, query, search) {
    const data = await anilistPost(fetcher, ANILIST_SEARCH, {
      search: query,
      type: search.format === 'video' ? 'ANIME' : 'MANGA',
    })
    return (data?.data?.Page?.media ?? []).map((media: any): Work => {
      media.type = search.format === 'video' ? 'ANIME' : 'MANGA'
      const images: Work['images'] = []
      const cover = media.coverImage?.extraLarge || media.coverImage?.large
      if (cover)
        images.push({
          kind: 'cover',
          image: cover,
          thumb: media.coverImage?.large || cover,
          width: null,
          height: null,
          note: 'Ana kapak',
          bonus: 0,
        })
      if (media.bannerImage)
        images.push({
          kind: 'banner',
          image: media.bannerImage,
          thumb: media.bannerImage,
          width: 1900,
          height: 400,
          note: 'Banner',
          bonus: 0,
        })
      return {
        ref: String(media.id),
        names: [
          media.title?.english,
          media.title?.romaji,
          media.title?.native,
          ...(media.synonyms || []),
        ].filter(Boolean),
        medium: anilistMedium(media),
        country: media.countryOfOrigin || null,
        year: yearOf(media.startDate?.year),
        link: media.siteUrl || `https://anilist.co/manga/${media.id}`,
        label: anilistLabel(media),
        popularity: Number(media.popularity) || 0,
        images,
      }
    })
  },

  async details(fetcher, ref) {
    const data = await anilistPost(fetcher, ANILIST_DETAILS, { id: Number(ref) })
    const media = data?.data?.Media
    if (!media) throw new Error('AniList: eser bulunamadı')
    const authors: string[] = []
    const artists: string[] = []
    for (const edge of media.staff?.edges ?? []) {
      const role = String(edge.role || '')
        .replace(/\s*\(.*\)$/, '')
        .trim()
      const name = edge.node?.name?.full
      if (!name) continue
      if (['Story & Art', 'Story', 'Original Creator', 'Original Story'].includes(role))
        authors.push(name)
      if (['Story & Art', 'Art'].includes(role)) artists.push(name)
    }
    // Anime: the main studio is the "author", as for the other video series here.
    if (media.type === 'ANIME')
      authors.unshift(...(media.studios?.nodes ?? []).map((n: any) => n.name))
    const tags = (media.tags || [])
      .filter((tag: any) => !tag.isMediaSpoiler && tag.rank >= 70)
      .map((tag: any) => tag.name)
    const title = media.title?.english || media.title?.romaji || ''
    return {
      source: 'anilist',
      sourceLabel: covers.sources.anilist.label,
      link: media.siteUrl,
      title,
      alternatives: unique(
        [media.title?.english, media.title?.romaji, media.title?.native, ...(media.synonyms || [])],
        [title]
      ),
      description: plainText(media.description),
      year: yearOf(media.startDate?.year),
      status: statusOf(media.status),
      ageRating: ageFrom({ adult: media.isAdult, genres: media.genres || [] }),
      medium: anilistMedium(media),
      country: media.countryOfOrigin || null,
      genres: unique(media.genres || []),
      tags: unique(tags),
      authors: unique(authors),
      artists: unique(artists),
      cover: media.coverImage?.extraLarge || null,
      banner: media.bannerImage || null,
    }
  },
}

/* ------------------------------------------------------------ MyAnimeList */

const malMedium: Record<string, Medium> = {
  'manga': 'comic',
  'manhwa': 'comic',
  'manhua': 'comic',
  'one-shot': 'comic',
  'light novel': 'novel',
  'novel': 'novel',
}
const malCountry: Record<string, string> = { manga: 'JP', manhwa: 'KR', manhua: 'CN' }

/** "…/r/116x180/images/manga/3/222295.jpg?s=…" → the large image "…/images/manga/3/222295l.jpg". */
function malImage(url: unknown) {
  const match = String(url ?? '').match(/\/images\/(anime|manga)\/(\d+)\/(\d+)\.(jpg|webp)/)
  return match
    ? `https://cdn.myanimelist.net/images/${match[1]}/${match[2]}/${match[3]}l.jpg`
    : null
}

const malKind = (format: ContentFormat) => (format === 'video' ? 'anime' : 'manga')

/** Text after "<span class="dark_text">Label:</span>" up to the end of its block. */
function malField(html: string, label: string) {
  const match = html.match(
    new RegExp(`<span class="dark_text">${label}:</span>([\\s\\S]*?)</div>`, 'i')
  )
  return match ? match[1] : ''
}

const mal: Provider = {
  async search(fetcher, query, search) {
    const kind = malKind(search.format)
    const params = new URLSearchParams({ type: kind, keyword: query, v: '1' })
    const data = await getJson(fetcher, `https://myanimelist.net/search/prefix.json?${params}`)
    const items = data?.categories?.find((c: any) => c.type === kind)?.items ?? []
    return items.map((item: any): Work => {
      const type = String(item.payload?.media_type || '')
      const image = malImage(item.image_url)
      return {
        ref: String(item.id),
        names: [item.name].filter(Boolean),
        medium: kind === 'anime' ? 'anime' : malMedium[type.toLowerCase()] || 'other',
        country: malCountry[type.toLowerCase()] || null,
        year: yearOf(item.payload?.start_year ?? item.payload?.aired ?? item.payload?.published),
        link: item.url || `https://myanimelist.net/${kind}/${item.id}`,
        label: type,
        popularity: Number(item.es_score) || 0,
        images: image
          ? [
              {
                kind: 'cover',
                image,
                thumb: image,
                width: null,
                height: null,
                note: 'Kapak',
                bonus: 0,
              },
            ]
          : [],
      }
    })
  },

  async details(fetcher, ref, format) {
    const kind = malKind(format)
    const link = `https://myanimelist.net/${kind}/${Number(ref)}`
    const page = await request(fetcher, link, { headers: { accept: 'text/html' } })
    const html = await page.text()
    const text = (value: string) => plainText(value)?.replace(/\s+/g, ' ').trim() || ''
    const title = text(html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] || '')
    const type = text(malField(html, 'Type'))
    const genres = [...html.matchAll(/<span itemprop="genre"[^>]*>([^<]+)<\/span>/g)].map((m) =>
      text(m[1])
    )
    const authors: string[] = []
    const artists: string[] = []
    for (const m of malField(html, 'Authors').matchAll(
      /<a href="[^"]*\/people\/\d+[^"]*">([^<]+)<\/a>\s*\(([^)]+)\)/g
    )) {
      const name = personName(text(m[1]))
      if (/story/i.test(m[2])) authors.push(name)
      if (/art/i.test(m[2])) artists.push(name)
    }
    if (kind === 'anime')
      for (const m of malField(html, 'Studios').matchAll(/<a [^>]*>([^<]+)<\/a>/g))
        authors.push(text(m[1]))
    const names = [
      text(malField(html, 'English')),
      ...text(malField(html, 'Synonyms')).split(/,\s*/),
      text(malField(html, 'Japanese')),
    ]
    const description = html.match(/itemprop="description"[^>]*>([\s\S]*?)<\/(?:span|p)>/)?.[1]
    return {
      source: 'mal',
      sourceLabel: covers.sources.mal.label,
      link,
      title,
      alternatives: unique(names, [title]),
      description: plainText(description),
      year: yearOf(malField(html, kind === 'anime' ? 'Aired' : 'Published')),
      status: statusOf(text(malField(html, 'Status'))),
      ageRating: ageFrom({ genres, rating: text(malField(html, 'Rating')) }),
      medium: kind === 'anime' ? 'anime' : malMedium[type.toLowerCase()] || 'other',
      country: malCountry[type.toLowerCase()] || null,
      genres: unique(genres),
      tags: [],
      authors: unique(authors),
      artists: unique(artists),
      cover: malImage(html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]),
      banner: null,
    }
  },
}

/* ------------------------------------------------------------------ Kitsu */

const kitsuMedium: Record<string, Medium> = {
  manga: 'comic',
  manhwa: 'comic',
  manhua: 'comic',
  oneshot: 'comic',
  oel: 'comic',
  doujin: 'other',
  novel: 'novel',
}
const kitsuCountry: Record<string, string> = { manga: 'JP', manhwa: 'KR', manhua: 'CN' }
const kitsuAges: Record<string, string> = { G: 'G', PG: 'PG-13', R: 'R', R18: 'R18' }

function kitsuWork(item: any, kind: 'anime' | 'manga'): Work {
  const a = item.attributes || {}
  const size = (image: any, name: string) => image?.meta?.dimensions?.[name] || {}
  const images: Work['images'] = []
  if (a.posterImage?.original || a.posterImage?.large) {
    const large = size(a.posterImage, 'large')
    images.push({
      kind: 'cover',
      image: a.posterImage.original || a.posterImage.large,
      thumb: a.posterImage.medium || a.posterImage.large || a.posterImage.original,
      width: large.width || null,
      height: large.height || null,
      note: 'Poster',
      bonus: 0,
    })
  }
  if (a.coverImage?.original || a.coverImage?.large) {
    const large = size(a.coverImage, 'large')
    images.push({
      kind: 'banner',
      image: a.coverImage.original || a.coverImage.large,
      thumb: a.coverImage.large || a.coverImage.original,
      width: large.width || null,
      height: large.height || null,
      note: 'Banner',
      bonus: 0,
    })
  }
  return {
    ref: String(item.id),
    names: [
      a.canonicalTitle,
      ...Object.values(a.titles || {}),
      ...(a.abbreviatedTitles || []),
    ].filter(Boolean) as string[],
    medium: kind === 'anime' ? 'anime' : kitsuMedium[a.subtype] || 'other',
    country: kitsuCountry[a.subtype] || null,
    year: yearOf(a.startDate),
    link: `https://kitsu.app/${kind}/${a.slug || item.id}`,
    label: a.subtype ? a.subtype.charAt(0).toUpperCase() + a.subtype.slice(1) : '',
    popularity: Number(a.userCount) || 0,
    images,
  }
}

const kitsu: Provider = {
  async search(fetcher, query, search) {
    const kind = search.format === 'video' ? 'anime' : 'manga'
    const params = new URLSearchParams({ 'filter[text]': query, 'page[limit]': '5' })
    const data = await getJson(fetcher, `https://kitsu.app/api/edge/${kind}?${params}`, {
      headers: { accept: 'application/vnd.api+json' },
    })
    return (data?.data ?? []).map((item: any) => kitsuWork(item, kind))
  },

  async details(fetcher, ref, format) {
    const kind = format === 'video' ? 'anime' : 'manga'
    const params = new URLSearchParams({ 'include': 'categories', 'fields[categories]': 'title' })
    const data = await getJson(
      fetcher,
      `https://kitsu.app/api/edge/${kind}/${Number(ref)}?${params}`,
      { headers: { accept: 'application/vnd.api+json' } }
    )
    const a = data?.data?.attributes
    if (!a) throw new Error('Kitsu: eser bulunamadı')
    const work = kitsuWork(data.data, kind)
    const genres = (data.included || [])
      .filter((item: any) => item.type === 'categories')
      .map((item: any) => item.attributes?.title)
    const title = a.titles?.en || a.titles?.en_us || a.canonicalTitle || ''
    return {
      source: 'kitsu',
      sourceLabel: covers.sources.kitsu.label,
      link: work.link,
      title,
      alternatives: unique(work.names, [title]),
      description: plainText(a.synopsis || a.description),
      year: work.year,
      status: statusOf(a.status),
      ageRating: ageFrom({ genres, rating: kitsuAges[a.ageRating] || '' }),
      medium: work.medium,
      country: work.country,
      genres: unique(genres),
      tags: [],
      authors: [],
      artists: [],
      cover: work.images.find((image) => image.kind === 'cover')?.image || null,
      banner: work.images.find((image) => image.kind === 'banner')?.image || null,
    }
  },
}

/* ------------------------------------------------------------------- IMDb */

/** Amazon image address in another size: "…_V1_.jpg" → "…_V1_UX300_.jpg". */
const imdbSized = (url: string, width: number) =>
  url.replace(/\._V1_[^/]*\.(jpg|png)$/, `._V1_UX${width}_.$1`)

const imdbTypes = new Set([
  'feature',
  'tvSeries',
  'tvMiniSeries',
  'tvMovie',
  'short',
  'tvSpecial',
  'video',
])

/** IMDb's public title suggestions (the site's search box); details pages refuse scripts. */
async function imdbSuggest(fetcher: Fetcher, query: string) {
  const term = normalize(query).replace(/\s+/g, '_').slice(0, 60) || query
  const data = await getJson(
    fetcher,
    `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(term)}.json`
  )
  return (data?.d ?? []).filter(
    (item: any) => /^tt\d+$/.test(item.id) && (!item.qid || imdbTypes.has(item.qid))
  )
}

function imdbWork(item: any): Work {
  const image = item.i?.imageUrl
  return {
    ref: item.id,
    names: [item.l].filter(Boolean),
    medium: 'anime',
    country: null,
    year: yearOf(item.y),
    link: `https://www.imdb.com/title/${item.id}/`,
    label: item.q || '',
    popularity: item.rank ? Math.max(1, 1_000_000 / item.rank) : 0,
    images: image
      ? [
          {
            kind: 'cover',
            image,
            thumb: imdbSized(image, 300),
            width: item.i.width || null,
            height: item.i.height || null,
            note: 'Afiş',
            bonus: 0,
          },
        ]
      : [],
  }
}

const imdb: Provider = {
  async search(fetcher, query) {
    const items = await imdbSuggest(fetcher, query)
    return items.map(imdbWork)
  },

  async details(fetcher, ref) {
    if (!/^tt\d+$/.test(ref)) throw new Error('IMDb: geçersiz kimlik')
    const items = await imdbSuggest(fetcher, ref)
    const item = items.find((entry: any) => entry.id === ref)
    if (!item) throw new Error('IMDb: eser bulunamadı')
    const work = imdbWork(item)
    return {
      source: 'imdb',
      sourceLabel: covers.sources.imdb.label,
      link: work.link,
      title: item.l || '',
      alternatives: [],
      description: null,
      year: work.year,
      status: null,
      ageRating: null,
      medium: 'anime',
      country: null,
      genres: [],
      tags: [],
      authors: [],
      artists: [],
      cover: work.images[0]?.image || null,
      banner: null,
    }
  },
}

export const providers: Record<CoverSource, Provider> = { anilist, mal, kitsu, imdb }

/* ----------------------------------------------------------------- search */

/** True when the address may be downloaded (https, host on covers.imageHosts). */
export function allowedImage(value: unknown): URL | null {
  try {
    const url = new URL(String(value))
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    return covers.imageHosts.includes(url.hostname) ? url : null
  } catch {
    return null
  }
}

/** A source's page address for "Kaynakta aç" (an `href`): http(s) only, else the source's site. */
function safeLink(value: unknown, source: CoverSource): string {
  const url = URL.canParse(String(value)) ? new URL(String(value)) : null
  return url && (url.protocol === 'https:' || url.protocol === 'http:')
    ? url.href
    : covers.sources[source].site
}

/** Sources asked for this content format. */
export function sourcesFor(format: ContentFormat): CoverSource[] {
  return (Object.keys(providers) as CoverSource[]).filter((source) => {
    const formats = covers.sources[source].formats
    return !formats || formats.includes(format)
  })
}

/** The title plus a few alternative titles (Latin letters first), without repeats. */
function queries(search: CoverSearch): string[] {
  const seen = new Set<string>()
  const list: string[] = []
  const nonLatin = (text: string) => Number(!latin(text))
  const alternatives = [...(search.alternatives || [])].sort((a, b) => nonLatin(a) - nonLatin(b))
  for (const text of [search.query, ...alternatives]) {
    const key = normalize(text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    list.push(String(text).trim().slice(0, covers.maxQueryLength))
  }
  return list.slice(0, 1 + covers.maxAlternatives)
}

const cache = new Map<string, { at: number; value: CoverResults }>()

export function clearCoverCache() {
  cache.clear()
}

export async function searchCovers(
  search: CoverSearch,
  fetcher: Fetcher = fetch
): Promise<CoverResults> {
  const terms = queries(search)
  const key = JSON.stringify([terms, search.format, search.type || '', search.year || ''])
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < covers.cacheMinutes * 60_000) return cached.value
  const results: CoverResults = { covers: [], banners: [], failures: [] }
  if (!terms.length) return results

  await Promise.all(
    sourcesFor(search.format).map(async (source) => {
      try {
        // Next alternative title only when the previous search found no matching work.
        for (const term of terms) {
          const found = await providers[source].search(fetcher, term, search)
          const added = collect(results, found, source, search, terms)
          if (added) break
        }
      } catch {
        results.failures.push({ source, label: covers.sources[source].label })
      }
    })
  )

  const seen = new Set<string>()
  const finish = (list: CoverCandidate[]) =>
    list
      .sort((a, b) => b.score - a.score)
      .filter((item) => !seen.has(item.image) && seen.add(item.image))
  results.covers = finish(results.covers).slice(0, 60)
  results.banners = finish(results.banners).slice(0, 20)
  results.failures.sort((a, b) => a.label.localeCompare(b.label))

  if (cache.size > 100) cache.delete(cache.keys().next().value!)
  // Failed sources are not cached, so the next search asks them again.
  if (!results.failures.length) cache.set(key, { at: Date.now(), value: results })
  return results
}

function collect(
  results: CoverResults,
  works: Work[],
  source: CoverSource,
  search: CoverSearch,
  terms: string[]
): number {
  let added = 0
  for (const work of works) {
    const match = Math.max(
      0,
      ...work.names.flatMap((name) => terms.map((term) => similarity(term, name)))
    )
    if (match < MIN_MATCH) continue
    const base = score(work, match, search, source)
    const title = work.names.find(latin) || work.names[0]
    for (const image of work.images) {
      if (!allowedImage(image.image) || !allowedImage(image.thumb)) continue
      const candidate: CoverCandidate = {
        id: `${source}:${image.image}`,
        source,
        sourceLabel: covers.sources[source].label,
        ref: work.ref,
        kind: image.kind,
        image: image.image,
        thumb: image.thumb,
        width: image.width,
        height: image.height,
        title,
        detail: [work.label, work.year, image.note].filter(Boolean).join(' · '),
        link: safeLink(work.link, source),
        match: Math.round(match * 100) / 100,
        score: Math.round((base + image.bonus + quality(image, source)) * 10) / 10,
      }
      ;(image.kind === 'cover' ? results.covers : results.banners).push(candidate)
      added++
    }
  }
  return added
}

/**
 * Fills what a source lacks (Kitsu has no authors, IMDb only a title and a poster) from the same
 * work on AniList: same medium, a name matching closely and a year at most one apart. Only empty
 * fields are taken; the source's own values stay.
 */
async function completed(
  details: WorkDetails,
  format: ContentFormat,
  fetcher: Fetcher
): Promise<WorkDetails> {
  const missing =
    !details.description ||
    !details.genres.length ||
    !details.authors.length ||
    !details.banner ||
    !details.status
  if (details.source === 'anilist' || !missing || !details.title) return details
  try {
    const names = [details.title, ...details.alternatives]
    const works = await anilist.search(fetcher, details.title, { query: details.title, format })
    const best = works
      .map((work) => ({
        work,
        match: Math.max(0, ...work.names.flatMap((n) => names.map((q) => similarity(q, n)))),
      }))
      .filter(
        ({ work, match }) =>
          match >= 0.9 &&
          (work.medium === details.medium || details.source === 'imdb') &&
          (!details.year || !work.year || Math.abs(details.year - work.year) <= 1)
      )
      .sort((a, b) => b.match - a.match || b.work.popularity - a.work.popularity)[0]
    if (!best) return details
    const extra = await anilist.details(fetcher, best.work.ref, format)
    return {
      ...details,
      sourceLabel: `${details.sourceLabel} + ${extra.sourceLabel}`,
      alternatives: unique([...details.alternatives, ...extra.alternatives], [details.title]),
      description: details.description || extra.description,
      year: details.year || extra.year,
      status: details.status || extra.status,
      ageRating: details.ageRating || extra.ageRating,
      medium: details.source === 'imdb' ? extra.medium : details.medium,
      country: details.country || extra.country,
      genres: details.genres.length ? details.genres : extra.genres,
      tags: unique([...details.tags, ...extra.tags]),
      authors: details.authors.length ? details.authors : extra.authors,
      artists: details.artists.length ? details.artists : extra.artists,
      banner: details.banner || extra.banner,
    }
  } catch {
    return details
  }
}

/** One work in full, for filling the form; images not on covers.imageHosts are dropped. */
export async function workDetails(
  source: CoverSource,
  ref: string,
  format: ContentFormat,
  fetcher: Fetcher = fetch
): Promise<WorkDetails> {
  const details = await completed(
    await providers[source].details(fetcher, ref, format),
    format,
    fetcher
  )
  return {
    ...details,
    link: safeLink(details.link, source),
    cover: allowedImage(details.cover) ? details.cover : null,
    banner: allowedImage(details.banner) ? details.banner : null,
  }
}

/* --------------------------------------------------------------- download */

/** A refused address or file (422) or a source that did not deliver (502). */
export class CoverImageError extends Error {
  constructor(
    message: string,
    readonly status = 422
  ) {
    super(message)
  }
}

/**
 * Downloads an image from an allowed host: redirects are followed only to allowed hosts, the body
 * is read up to covers.maxImageBytes and the type is taken from the file signature (JPG, PNG or
 * WebP, what the cover field accepts).
 */
export async function downloadCover(
  address: string,
  fetcher: Fetcher = fetch
): Promise<{ bytes: Buffer; type: string; ext: string }> {
  let url = allowedImage(address)
  if (!url) throw new CoverImageError('Bu adresten görsel indirilemez.')
  let response: Response | null = null
  for (let hop = 0; hop < 4; hop++) {
    response = await fetcher(url.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(covers.timeoutMs * 2),
      headers: { 'accept': 'image/avif,image/webp,image/*', 'user-agent': covers.userAgent },
    })
    if (response.status < 300 || response.status >= 400) break
    const next = allowedImage(new URL(response.headers.get('location') || '', url).href)
    await response.body?.cancel()
    if (!next) throw new CoverImageError('Görsel izin verilmeyen bir adrese yönlendirildi.')
    url = next
    response = null
  }
  if (!response || !response.ok || !response.body)
    throw new CoverImageError('Görsel indirilemedi; kaynak site yanıt vermedi.', 502)
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > covers.maxImageBytes) {
    await response.body.cancel()
    throw new CoverImageError('Görsel 10 MB sınırını aşıyor.')
  }
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength
    if (size > covers.maxImageBytes) throw new CoverImageError('Görsel 10 MB sınırını aşıyor.')
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  const kind = imageTypeOf(bytes)
  if (!kind || !['jpg', 'png', 'webp'].includes(kind.ext))
    throw new CoverImageError('Kaynak JPG, PNG veya WebP olmayan bir dosya gönderdi.')
  return { bytes, type: kind.type, ext: kind.ext }
}
