import db from '@adonisjs/lucid/services/db'
import reader, { type ReaderDirection, type ReaderMode } from '#config/reader'
import type User from '#models/user'

/** What the server needs to lay out the first paint of an image chapter. */
export interface ReaderView {
  mode: ReaderMode
  zoom: number
  dir: ReaderDirection
}

/** The full reading settings kept for an account (and in reader.js `reader-prefs`). */
export interface ReaderPrefs extends ReaderView {
  /** Novel text size step. */
  font: number
  /** Paged mode: "Sonraki" on the last page opens the next chapter. */
  auto: boolean
}

const isMode = (value: unknown): value is ReaderMode =>
  (reader.modes as readonly unknown[]).includes(value)
const isDirection = (value: unknown): value is ReaderDirection =>
  (reader.directions as readonly unknown[]).includes(value)

/** Rows changed by a Lucid/Knex update (a number, or `[number]` on some drivers). */
const affected = (result: unknown) => Number(Array.isArray(result) ? result[0] : result) || 0

class ReaderService {
  /**
   * Mode, size and direction from the plain `reader` cookie written by reader.js: "paged-125",
   * "paged-125-rtl" (older cookies have no direction and read left to right). Anything invalid
   * falls back to webtoon / 100 % / left to right, part by part.
   */
  viewOfCookie(value: unknown): ReaderView {
    const match = /^(webtoon|paged)-(\d{2,3})(?:-(ltr|rtl))?$/.exec(
      typeof value === 'string' ? value : ''
    )
    const zoom = match ? Number(match[2]) : reader.defaultZoom
    return {
      mode: isMode(match?.[1]) ? match[1] : 'webtoon',
      zoom: zoom >= reader.zoomSteps[0] && zoom <= reader.zoomSteps.at(-1)! ? zoom : 100,
      dir: isDirection(match?.[3]) ? match[3] : 'ltr',
    }
  }

  /** Stored or posted settings with every field checked; unknown values take the default. */
  normalize(raw: unknown): ReaderPrefs {
    const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const zoom = Number(data.zoom)
    const font = Number(data.font)
    return {
      mode: isMode(data.mode) ? data.mode : 'webtoon',
      zoom: reader.zoomSteps.includes(zoom) ? zoom : reader.defaultZoom,
      dir: isDirection(data.dir) ? data.dir : 'ltr',
      font:
        Number.isInteger(font) && font >= 0 && font < reader.fontSteps ? font : reader.defaultFont,
      auto: data.auto === true,
    }
  }

  /** The account's saved settings, or null when it never changed any (or the JSON is broken). */
  prefsOf(user: User | null | undefined): ReaderPrefs | null {
    if (!user?.readerPrefs) return null
    try {
      return this.normalize(JSON.parse(user.readerPrefs))
    } catch {
      return null
    }
  }

  async savePrefs(user: User, prefs: unknown) {
    const value = JSON.stringify(this.normalize(prefs))
    await db.from('users').where('id', user.id).update({ reader_prefs: value })
    user.readerPrefs = value
    return this.normalize(prefs)
  }

  /** Page last seen in a chapter the account has opened (1-based), or null. */
  async positionOf(userId: number, chapterId: number) {
    const row = await db
      .from('chapter_reads')
      .where({ user_id: userId, chapter_id: chapterId })
      .select('last_page')
      .first()
    const page = Number(row?.last_page)
    return Number.isInteger(page) && page > 0 ? page : null
  }

  /**
   * Remembers the page on screen. Only chapters the account has already opened (a reading row,
   * written after every gate was passed) take a position; nothing else is recorded or rewarded.
   * False when there is no such row.
   */
  async savePosition(userId: number, chapterId: number, page: number) {
    const result = await db
      .from('chapter_reads')
      .where({ user_id: userId, chapter_id: chapterId })
      .update({ last_page: page })
    return affected(result) > 0
  }
}

export default new ReaderService()
