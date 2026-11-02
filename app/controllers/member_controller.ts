import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { avatarHue } from '#services/comment_service'
import { takeAttempt } from '#services/throttle'

const queryPattern = /^[a-zA-Z0-9_]{2,20}$/
const limit = 6

/** Member lookups for signed-in readers (the @mention picker of the comment composer). */
export default class MemberController {
  /** GET /uyeler/ara?q=: usernames starting with q (at least 2 characters), active accounts. */
  async search({ request, auth, response }: HttpContext) {
    const query = String(request.input('q', '')).trim().replace(/^@/, '')
    if (!queryPattern.test(query)) return { items: [] }
    if (!takeAttempt(`member-search:${auth.user!.id}`, 60, 60 * 1000))
      return response.tooManyRequests({ error: 'Çok hızlı arıyorsun. Biraz bekle.' })
    // "_" is a LIKE wildcard and a username character; "!" escapes it on SQLite and MySQL.
    const pattern = `${query.toLowerCase().replace(/[!%_]/g, (char) => `!${char}`)}%`
    const rows = await db
      .from('users')
      .whereRaw(`username like ? escape '!'`, [pattern])
      .whereNull('banned_at')
      .orderByRaw('length(username) asc')
      .orderBy('username', 'asc')
      .limit(limit)
      .select('username', 'full_name', 'avatar')
    return {
      items: rows.map((row) => ({
        username: row.username,
        fullName: row.full_name,
        avatar: row.avatar,
        hue: avatarHue(row.username),
      })),
    }
  }
}
