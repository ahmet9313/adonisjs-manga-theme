import vine from '@vinejs/vine'
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
