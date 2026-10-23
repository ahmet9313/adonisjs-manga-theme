import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

/**
 * Turkish-aware search text.
 *
 * `series.search_text` holds the folded title, address, alternative titles, authors and artists
 * of a series, so "seytan", "ŞEYTAN" and "şeytan" all find "Şeytan Avcısı" with a plain LIKE that
 * works the same on SQLite and MySQL. It is written by the Series model (title/alternative title
 * changes), by `refreshSearchText` after authors or artists change (admin form, seeders, author
 * and artist renames, covers:fetch) and backfilled by migration 0031. Rows without it (written
 * by raw inserts) are still found by the old title / alternative title LIKE.
 */

/**
 * Lower case by Turkish rules (I → ı, İ → i), dotless ı → i, Latin diacritics dropped (ş → s, é → e),
 * apostrophes removed ("Journey's" → "journeys") and every other punctuation run turned into one
 * space ("Solo Leveling: Ragnarok" → "solo leveling ragnarok").
 */
export function foldSearch(text: unknown): string {
  return (
    String(text ?? '')
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i')
      .normalize('NFKD')
      // Only Latin and Greek letters lose their marks; kana (ピ, デ) and Cyrillic й stay intact.
      .replace(/([\p{Script=Latin}\p{Script=Greek}])\p{M}+/gu, '$1')
      .normalize('NFC')
      .replace(/['’‘`ʼ´]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  )
}

/** Folded words of a search query (each must appear somewhere in `search_text`), at most 8. */
export function searchWords(query: unknown): string[] {
  return [...new Set(foldSearch(query).split(' ').filter(Boolean))].slice(0, 8)
}

/** `search_text` of one series from its names (title first: prefix matches rank first). */
export function searchTextOf(parts: { title: string; slug?: string | null; names?: unknown[] }) {
  return [parts.title, ...(parts.names || []), parts.slug].map(foldSearch).filter(Boolean).join(' ')
}

/** Alternative titles as stored (JSON text on SQLite, parsed on MySQL). */
function titlesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** Author and artist names of the given series, by series id. */
async function peopleOf(ids: number[], client: QueryClientContract) {
  const names = new Map<number, string[]>()
  for (const [pivot, table, key] of [
    ['series_authors', 'authors', 'author_id'],
    ['series_artists', 'artists', 'artist_id'],
  ] as const) {
    const rows = await client
      .from(pivot)
      .join(table, `${table}.id`, `${pivot}.${key}`)
      .whereIn(`${pivot}.series_id`, ids)
      .select(`${pivot}.series_id as seriesId`, `${table}.name as name`)
    for (const row of rows) {
      const list = names.get(Number(row.seriesId)) || []
      if (!list.includes(row.name)) list.push(row.name)
      names.set(Number(row.seriesId), list)
    }
  }
  return names
}

/** `search_text` for one series as the model is about to save it (people from the database). */
export async function searchTextFor(
  series: { id?: number; title: string; slug: string; alternativeTitles?: string[] | null },
  client: QueryClientContract = db.connection()
) {
  const people = series.id ? await peopleOf([series.id], client) : null
  return searchTextOf({
    title: series.title,
    slug: series.slug,
    names: [...(series.alternativeTitles || []), ...(people?.get(series.id!) || [])],
  })
}

/** Rewrites `search_text` of the given series (or of every series), 200 rows at a time. */
export async function refreshSearchText(
  ids: number[] | 'all',
  client: QueryClientContract = db.connection()
): Promise<number> {
  let updated = 0
  let lastId = 0
  const wanted = ids === 'all' ? null : [...new Set(ids)].filter(Number.isSafeInteger)
  if (wanted && !wanted.length) return 0
  while (true) {
    const rows = await client
      .from('series')
      .select('id', 'title', 'slug', 'alternative_titles')
      .if(wanted, (query) => query.whereIn('id', wanted!))
      .where('id', '>', lastId)
      .orderBy('id', 'asc')
      .limit(200)
    if (!rows.length) break
    const people = await peopleOf(
      rows.map((row) => Number(row.id)),
      client
    )
    for (const row of rows) {
      const text = searchTextOf({
        title: row.title,
        slug: row.slug,
        names: [...titlesOf(row.alternative_titles), ...(people.get(Number(row.id)) || [])],
      })
      await client.from('series').where('id', row.id).update({ search_text: text })
      updated++
    }
    lastId = Number(rows.at(-1)!.id)
  }
  return updated
}

/** Ids of the series an author or artist appears in (to refresh them after a rename/delete). */
export async function seriesOfPerson(kind: 'author' | 'artist', id: number): Promise<number[]> {
  const rows = await db
    .from(kind === 'author' ? 'series_authors' : 'series_artists')
    .where(kind === 'author' ? 'author_id' : 'artist_id', id)
    .select('series_id')
  return rows.map((row) => Number(row.series_id))
}
