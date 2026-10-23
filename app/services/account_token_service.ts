import { createHash, randomBytes } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import site from '#config/site'
import { now } from '#services/input_service'

/**
 * `reset`: "Şifremi unuttum" link. `verify`: confirms the address given at registration.
 * `email_change`: confirms a new address entered in the settings.
 */
export type AccountTokenType = 'reset' | 'verify' | 'email_change'

type Client = typeof db | ReturnType<typeof db.connection>

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex')

/** "YYYY-MM-DD HH:mm:ss" UTC, the format every timestamp column uses. */
const stamp = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ')

function lifetime(type: AccountTokenType) {
  return type === 'reset'
    ? site.accountLinks.resetMinutes * 60 * 1000
    : site.accountLinks.verifyDays * 24 * 60 * 60 * 1000
}

/**
 * Single-use, expiring links for account mails. The random token only exists in the mail; the
 * database keeps its SHA-256, so a leaked database cannot be used to reset passwords.
 */
class AccountTokenService {
  /**
   * New link for the user. Earlier unused links of the same kind stop working (only the newest
   * mail counts), and long-expired rows are swept on the way.
   */
  async issue(user: User, type: AccountTokenType) {
    const token = randomBytes(32).toString('base64url')
    const created = new Date()
    await db.transaction(async (trx) => {
      await trx
        .from('account_tokens')
        .where('user_id', user.id)
        .where('type', type)
        .whereNull('used_at')
        .delete()
      await trx
        .from('account_tokens')
        .where('expires_at', '<', stamp(new Date(created.getTime() - 24 * 60 * 60 * 1000)))
        .delete()
      await trx.table('account_tokens').insert({
        user_id: user.id,
        type,
        token_hash: hashOf(token),
        email: user.email,
        expires_at: stamp(new Date(created.getTime() + lifetime(type))),
        created_at: stamp(created),
      })
    })
    return token
  }

  /**
   * The unused, unexpired link with this token and its user. Verification links also need the
   * account to still have the address they were sent to.
   */
  async find(token: unknown, types: AccountTokenType[]) {
    if (typeof token !== 'string' || !/^[\w-]{20,100}$/.test(token)) return null
    const row = await db
      .from('account_tokens')
      .where('token_hash', hashOf(token))
      .whereIn('type', types)
      .whereNull('used_at')
      .where('expires_at', '>', now())
      .first()
    if (!row) return null
    const user = await User.find(row.user_id)
    if (!user) return null
    if (row.type !== 'reset' && row.email !== user.email) return null
    return { id: Number(row.id), type: row.type as AccountTokenType, user }
  }

  /**
   * Marks the link used. False when another request used it first (the update is conditional,
   * so a link opened twice at the same moment works once).
   */
  async consume(id: number, client: Client = db) {
    const changed = await client
      .from('account_tokens')
      .where('id', id)
      .whereNull('used_at')
      .update({ used_at: now() })
    return Number(Array.isArray(changed) ? changed[0] : changed) > 0
  }

  /** Every unused link of these kinds stops working (after a reset or a confirmed address). */
  async revoke(userId: number, types: AccountTokenType[], client: Client = db) {
    await client
      .from('account_tokens')
      .where('user_id', userId)
      .whereIn('type', types)
      .whereNull('used_at')
      .delete()
  }
}

export default new AccountTokenService()
