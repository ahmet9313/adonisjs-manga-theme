import db from '@adonisjs/lucid/services/db'
import site from '#config/site'

/**
 * @kullanıcı mentions in comments. A mention is "@" + a username (account_service
 * usernamePattern) that does not follow a letter, digit, "_" or "@", so e-mail addresses stay
 * plain text. Only the first `site.commentMentionLimit` distinct names count: they are linked
 * when the account exists (and is not suspended) and their owners get an inbox message.
 */
const mentionPattern = /(^|[^\w@])@([a-zA-Z0-9_]{3,20})(?!\w)/g

const escapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => escapes[char])

class MentionService {
  /** Distinct lower-case usernames in writing order, at most the mention limit. */
  extract(body: string | null | undefined) {
    const names: string[] = []
    for (const match of (body || '').matchAll(mentionPattern)) {
      const name = match[2].toLowerCase()
      if (!names.includes(name)) names.push(name)
      if (names.length >= site.commentMentionLimit) break
    }
    return names
  }

  /** Existing, active accounts among these usernames: lower-case name → user id. */
  async resolve(names: Iterable<string>) {
    const list = [...new Set(names)]
    if (!list.length) return new Map<string, number>()
    const rows = await db
      .from('users')
      .whereIn('username', list)
      .whereNull('banned_at')
      .select('id', 'username')
    return new Map(rows.map((row) => [String(row.username).toLowerCase(), Number(row.id)]))
  }

  /** Known accounts mentioned in any of these bodies (one query for a page of comments). */
  async known(bodies: (string | null | undefined)[]) {
    const names = new Set(bodies.flatMap((body) => this.extract(body)))
    const resolved = await this.resolve(names)
    return new Set(resolved.keys())
  }

  /**
   * The body as safe HTML: everything is escaped and the counted mentions of `known` accounts
   * become profile links. Line breaks stay as text (the comment text keeps white space).
   */
  render(body: string | null | undefined, known: Set<string>) {
    const text = body || ''
    const counted = new Set(this.extract(text))
    let html = ''
    let last = 0
    for (const match of text.matchAll(mentionPattern)) {
      const name = match[2].toLowerCase()
      if (!counted.has(name) || !known.has(name)) continue
      const at = match.index + match[1].length
      html += escapeHtml(text.slice(last, at))
      html += `<a href="/uye/${encodeURIComponent(name)}" class="mention">@${escapeHtml(match[2])}</a>`
      last = at + 1 + match[2].length
    }
    return html + escapeHtml(text.slice(last))
  }
}

export default new MentionService()
