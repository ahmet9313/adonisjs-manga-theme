import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import type { ReportStatus, ReportTarget } from '#config/moderation'

/** A chapter error report or a comment / review complaint (see config/moderation.ts). */
export default class Report extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare reporterId: number | null

  @column({ serializeAs: null })
  declare reporterIp: string | null

  @column()
  declare targetType: ReportTarget

  @column()
  declare targetId: number

  @column()
  declare reason: string

  @column()
  declare note: string | null

  @column()
  declare status: ReportStatus

  @column()
  declare resolvedBy: number | null

  @column()
  declare resolvedAt: string | null

  @column()
  declare resolution: string | null

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string

  @belongsTo(() => User, { foreignKey: 'reporterId' })
  declare reporter: BelongsTo<typeof User>
}
