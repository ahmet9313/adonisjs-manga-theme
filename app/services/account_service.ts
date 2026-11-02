import vine from '@vinejs/vine'
import { createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import { invalidField } from '#services/upload_service'

export const usernamePattern = /^[a-zA-Z0-9_]{3,20}$/
const reservedUsernames = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'moderator',
  'destek',
])

export const loginValidator = vine.compile(
  vine.object({
    login: vine.string().trim().minLength(1).maxLength(255),
    password: vine.string().minLength(1).maxLength(255),
    remember: vine.enum(['on']).optional(),
    next: vine.string().maxLength(500).optional(),
  })
)

export const registerValidator = vine.compile(
  vine.object({
    username: vine.string().trim().regex(usernamePattern),
    email: vine.string().trim().email().maxLength(255),
    password: vine
      .string()
      .minLength(8)
      .maxLength(255)
      .confirmed({ confirmationField: 'password_confirmation' }),
    next: vine.string().maxLength(500).optional(),
  })
)

export const profileValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(2).maxLength(40),
    bio: vine.string().trim().maxLength(300).optional(),
  })
)

export const accountValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().maxLength(255),
    current_password: vine.string().minLength(1).maxLength(255),
  })
)

export const passwordValidator = vine.compile(
  vine.object({
    current_password: vine.string().minLength(1).maxLength(255),
    password: vine
      .string()
      .minLength(8)
      .maxLength(255)
      .confirmed({ confirmationField: 'password_confirmation' }),
  })
)

/** Only same-site absolute paths may be used as post-login destinations. */
export function safeNext(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return fallback
  if (value.startsWith('//') || value.includes('\\') || /[\r\n]/.test(value)) return fallback
  return value
}

export async function assertUniqueIdentity(
  username: string | null,
  email: string | null,
  ignoreId?: number
) {
  if (username) {
    if (reservedUsernames.has(username)) invalidField('username', 'Bu kullanıcı adı kullanılamaz.')
    const query = User.query().where('username', username)
    if (ignoreId) query.whereNot('id', ignoreId)
    if (await query.first()) invalidField('username', 'Bu kullanıcı adı zaten alınmış.')
  }
  if (email) {
    const query = User.query().where('email', email)
    if (ignoreId) query.whereNot('id', ignoreId)
    if (await query.first()) invalidField('email', 'Bu e-posta adresi zaten kullanılıyor.')
  }
}

export function profileUrl(user: Pick<User, 'username'>) {
  return `/uye/${encodeURIComponent(user.username)}`
}

/**
 * Session key of the account stamp. Sessions live in a cookie, so they cannot be deleted on the
 * server; instead each one carries a stamp of the password and e-mail it was opened with, and
 * a session whose stamp no longer matches is signed out (silent_auth_middleware).
 */
export const SESSION_STAMP = 'auth_stamp'

export function sessionStamp(user: Pick<User, 'id' | 'password' | 'email'>) {
  return createHash('sha256')
    .update(`${user.id}:${user.password}:${user.email}`)
    .digest('base64url')
    .slice(0, 22)
}

/**
 * After a password or e-mail change: every "beni hatırla" login and every other session ends;
 * this one goes on (keeping "beni hatırla" if it had it).
 */
export async function signOutOtherDevices(
  user: User,
  {
    auth,
    request,
    session,
  }: Pick<import('@adonisjs/core/http').HttpContext, 'auth' | 'request' | 'session'>
) {
  const remembered = Boolean(request.encryptedCookie('remember_web'))
  await db.from('remember_me_tokens').where('tokenable_id', user.id).delete()
  await auth.use('web').login(user, remembered)
  session.put(SESSION_STAMP, sessionStamp(user))
}
