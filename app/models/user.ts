import { BaseModel, column } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbRememberMeTokensProvider } from '@adonisjs/auth/session'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { staffRoles, isRole, type Role } from '#config/roles'
import settings from '#services/settings_service'
import { onlineMinutes } from '#config/rewards'
import { levelFor, isRecent } from '#services/level'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email', 'username'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  static rememberMeTokens = DbRememberMeTokensProvider.forModel(User)

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare username: string

  @column()
  declare fullName: string

  @column()
  declare email: string

  @column({ serializeAs: null })
  declare password: string

  @column()
  declare role: Role

  @column()
  declare avatar: string | null

  @column()
  declare banner: string | null

  @column()
  declare bio: string | null

  @column()
  declare bannedAt: string | null

  @column()
  declare lastLoginAt: string | null

  @column()
  declare exp: number

  @column()
  declare streak: number

  @column()
  declare bestStreak: number

  @column()
  declare lastCheckinOn: string | null

  @column()
  declare lastSeenAt: string | null

  @column()
  declare frameId: number | null

  @column()
  declare effectId: number | null

  @column()
  declare wallpaperId: number | null

  @column()
  declare profileLikeCount: number

  /** Reading settings as JSON (reader_service.normalizePrefs); null until first changed. */
  @column({ serializeAs: null })
  declare readerPrefs: string | null

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string

  get roleInfo() {
    return settings.role(isRole(this.role) ? this.role : 'member')
  }

  get isStaff() {
    return staffRoles.includes(this.role)
  }

  get isAdmin() {
    return this.role === 'admin'
  }

  get level() {
    return levelFor(this.exp || 0).level
  }

  get isOnline() {
    return isRecent(this.lastSeenAt, onlineMinutes)
  }
}
