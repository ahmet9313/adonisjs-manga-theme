import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import type { AdminLogAction, AdminLogTarget } from '#config/admin_tools'

/** One change made in the administration panel (admin_log_service). */
export default class AdminLog extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  /** Null once the account is deleted; the summary keeps the context. */
  @column()
  declare userId: number | null

  @column()
  declare action: AdminLogAction

  @column()
  declare targetType: AdminLogTarget

  @column()
  declare targetId: number | null

  @column()
  declare summary: string

  @column()
  declare createdAt: string

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
