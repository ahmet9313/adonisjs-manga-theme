import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Series from '#models/series'
import Chapter from '#models/chapter'

export default class Comment extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare seriesId: number

  @column()
  declare chapterId: number | null

  @column()
  declare parentId: number | null

  @column()
  declare rootId: number | null

  @column()
  declare depth: number

  @column()
  declare body: string

  @column()
  declare image: string | null

  @column({ consume: (value) => Boolean(value) })
  declare spoiler: boolean

  @column()
  declare likeCount: number

  @column()
  declare dislikeCount: number

  @column()
  declare replyCount: number

  @column()
  declare stickerId: number | null

  @column()
  declare deletedAt: string | null

  /** Last edit by the author (null when never edited). */
  @column()
  declare editedAt: string | null

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Comment, { foreignKey: 'parentId' })
  declare parent: BelongsTo<typeof Comment>

  @hasMany(() => Comment, { foreignKey: 'parentId' })
  declare replies: HasMany<typeof Comment>

  @belongsTo(() => Series)
  declare series: BelongsTo<typeof Series>

  @belongsTo(() => Chapter)
  declare chapter: BelongsTo<typeof Chapter>
}
