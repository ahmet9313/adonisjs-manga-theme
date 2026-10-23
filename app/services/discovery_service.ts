import SeriesModel from '#models/series'
import ContentType from '#models/content_type'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import { filterValues } from '#services/input_service'
import { foldSearch, searchWords } from '#services/search_index_service'
import { serializeSeries } from '#services/series_presenter'
import { variantUrl } from '#services/media_service'

/**
 * Discovery: catalog filters beyond the basics (genre include/exclude with AND/OR, year range,
 * minimum chapters), Turkish-aware text search, the A–Z index and the random series. Drafts never
 * appear; members / VIP series are listed as in the catalog (their chapters are gated).
 */

type SeriesQuery = ModelQueryBuilderContract<typeof SeriesModel>

export interface DiscoveryFilters {
  genres: string[]
  /** Genres a series must not have. */
  excludedGenres: string[]
  /** `all`: every included genre (VE); `any`: at least one (VEYA, the default). */
  genreMode: 'all' | 'any'
  yearFrom: number | null
  yearTo: number | null
  minChapters: number | null
}

const YEAR_MIN = 1900

function intIn(value: unknown, min: number, max: number): number | null {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{1,6}$/.test(text)) return null
  const number = Number(text)
  return number >= min && number <= max ? number : null
}

/** Reads the discovery fields of the catalog query string (bad values are dropped). */
export function parseDiscoveryFilters(qs: Record<string, unknown>): DiscoveryFilters {
  const excludedGenres = filterValues(qs.xgenre)
  const yearMax = new Date().getFullYear() + 1
  let yearFrom = intIn(qs.year_from, YEAR_MIN, yearMax)
  let yearTo = intIn(qs.year_to, YEAR_MIN, yearMax)
  if (yearFrom && yearTo && yearFrom > yearTo) [yearFrom, yearTo] = [yearTo, yearFrom]
  const minChapters = intIn(qs.min_chapters, 1, 100_000)
  return {
    // A genre both wanted and excluded (hand-written URL) counts as excluded.
    genres: filterValues(qs.genre).filter((genre) => !excludedGenres.includes(genre)),
    excludedGenres,
    genreMode: qs.genre_mode === 'all' ? 'all' : 'any',
    yearFrom,
    yearTo,
    minChapters,
  }
}

/** Series whose names contain every word of `text` (Turkish letters and punctuation ignored). */
export function whereMatches(query: SeriesQuery, text: string) {
  const words = searchWords(text)
  const like = `%${text}%`
  return query.where((builder) => {
    if (words.length)
      builder.where((folded) => {
        for (const word of words) folded.where('searchText', 'like', `%${word}%`)
      })
    // Rows written without search_text (raw inserts) keep the old match.
    builder.orWhere((legacy) =>
      legacy
        .whereNull('searchText')
        .where((names) => names.whereILike('title', like).orWhereILike('alternativeTitles', like))
    )
  })
}

/** Title prefix matches first (search_text starts with the folded title). */
export function orderByMatch(query: SeriesQuery, text: string) {
  const prefix = searchWords(text).join(' ')
  if (prefix) query.orderByRaw('case when search_text like ? then 0 else 1 end', [`${prefix}%`])
  return query
}

/** Applies the genre, year and chapter filters (and the text search) to a series query. */
export function applyDiscoveryFilters(
  query: SeriesQuery,
  filters: Partial<DiscoveryFilters> & { search?: string }
) {
  const genres = filters.genres || []
  if (genres.length && filters.genreMode === 'all') {
    for (const genre of genres) query.whereHas('genres', (rows) => rows.where('name', genre))
  } else if (genres.length) {
    query.whereHas('genres', (rows) => rows.whereIn('name', genres))
  }
  if (filters.excludedGenres?.length)
    query.whereDoesntHave('genres', (rows) => rows.whereIn('name', filters.excludedGenres!))
  if (filters.yearFrom) query.where('publicationYear', '>=', filters.yearFrom)
  if (filters.yearTo) query.where('publicationYear', '<=', filters.yearTo)
  if (filters.minChapters)
    query.whereHas('chapters', (rows) => rows.where('draft', false), '>=', filters.minChapters)
  if (filters.search) whereMatches(query, filters.search)
  return query
}

/** Live search (/ara): up to 10 published series with cover, type and latest chapter. */
export async function suggest(text: string) {
  if (foldSearch(text).length < 2) return []
  const query = SeriesModel.query().where('draft', false).preload('contentType').preload('genres')
  whereMatches(query, text)
  orderByMatch(query, text)
  const rows = await query
    .orderBy('ratingCount', 'desc')
    .orderBy('title', 'asc')
    .withAggregate('chapters', (chapters) =>
      chapters.where('draft', false).max('number').as('lastChapter')
    )
    .limit(10)
  const words = searchWords(text)
  const matches = (name: string) => {
    const folded = foldSearch(name)
    return words.every((word) => folded.includes(word))
  }
  return rows.map((row) => {
    const series = serializeSeries(row)
    return {
      title: series.title,
      slug: series.slug,
      type: series.type,
      status: series.status,
      coverImage: series.coverImage,
      thumb: variantUrl(series.coverImage, 160),
      coverVeil: series.coverVeil,
      genres: series.genres.slice(0, 3),
      lastChapter: Number(row.$extras.lastChapter || 0) || null,
      // Found by another name ("Kimetsu no Yaiba" → Şeytan Avcısı): shown under the title.
      alias: matches(series.title) ? null : series.alternativeTitles.find(matches) || null,
    }
  })
}

// ---- A–Z -------------------------------------------------------------------------------------

/** The Turkish alphabet plus Q, W, X; "#" holds digits, symbols and other scripts. */
export const LETTERS = [...'ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZ', '#']

const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true })

/** Title without leading quotes/brackets ("[Oshi no Ko]" sorts under O). */
const sortable = (title: string) =>
  title
    .normalize('NFC')
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, '')

/** Index letter of a title by Turkish rules: "Çağ" → Ç, "İz" → İ, "Işık" → I, "Élan" → E. */
export function initialOf(title: string): string {
  const first = [...sortable(title)][0]
  if (!first) return '#'
  const upper = first.toLocaleUpperCase('tr')
  if (LETTERS.includes(upper)) return upper
  const base = upper.normalize('NFD').replace(/\p{M}/gu, '')
  return LETTERS.includes(base) ? base : '#'
}

export const compareTitles = (a: string, b: string) => collator.compare(sortable(a), sortable(b))

/** Accepts "a", "Ç", "ç", "#"; anything else means every letter. */
export function letterParam(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const upper = value.trim().normalize('NFC').toLocaleUpperCase('tr')
  return LETTERS.includes(upper) ? upper : null
}

/**
 * A–Z page: counts per letter and one page of titles (all letters when `letter` is null),
 * sorted by Turkish collation.
 */
export async function alphabet(letter: string | null, page: number, perPage = 60) {
  const rows = await SeriesModel.query().where('draft', false).select('id', 'title')
  const counts = Object.fromEntries(LETTERS.map((item) => [item, 0])) as Record<string, number>
  const entries = rows.map((row) => ({
    id: row.id,
    title: row.title,
    letter: initialOf(row.title),
  }))
  for (const entry of entries) counts[entry.letter]++
  const listed = entries
    .filter((entry) => !letter || entry.letter === letter)
    .sort(
      (a, b) =>
        LETTERS.indexOf(a.letter) - LETTERS.indexOf(b.letter) || compareTitles(a.title, b.title)
    )
  const total = listed.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const slice = listed.slice((page - 1) * perPage, page * perPage)

  const models = slice.length
    ? await SeriesModel.query()
        .whereIn(
          'id',
          slice.map((entry) => entry.id)
        )
        .preload('contentType')
        .withAggregate('chapters', (chapters) =>
          chapters.where('draft', false).max('number').as('lastChapter')
        )
    : []
  const byId = new Map(models.map((model) => [model.id, model]))
  const items = slice.flatMap((entry) => {
    const model = byId.get(entry.id)
    if (!model) return []
    return [
      {
        ...serializeSeries(model),
        letter: entry.letter,
        lastChapter: Number(model.$extras.lastChapter || 0),
      },
    ]
  })
  return { counts, items, total, totalPages, all: rows.length }
}

// ---- Random ----------------------------------------------------------------------------------

/** A random published series (optionally of one content type), or null when there is none. */
export async function randomSeries(type?: string | null) {
  const contentType = type ? await ContentType.findBy('slug', type) : null
  if (type && !contentType) return null
  const scoped = () =>
    SeriesModel.query()
      .where('draft', false)
      .if(contentType, (query) => query.where('contentTypeId', contentType!.id))
  const counted = await scoped().count('* as total').first()
  const total = Number(counted?.$extras.total || 0)
  if (!total) return null
  const series = await scoped()
    .preload('contentType')
    .orderBy('id', 'asc')
    .offset(Math.floor(Math.random() * total))
    .first()
  return series ? { type: series.contentType.slug, slug: series.slug } : null
}
