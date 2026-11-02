import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

/** Announcement (`/duyuru/:slug`) with a Markdown body. `publishedAt` null is a draft. */
export default class Post extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare slug: string

  @column()
  declare body: string

  /** Pinned announcements come first in every list. */
  @column({ consume: (value) => Boolean(value) })
  declare pinned: boolean

  @column()
  declare publishedAt: string | null

  @column()
  declare authorId: number | null

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string

  @belongsTo(() => User, { foreignKey: 'authorId' })
  declare author: BelongsTo<typeof User>
}
