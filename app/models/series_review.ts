import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Series from '#models/series'

export default class SeriesReview extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare seriesId: number

  /** 1–10. */
  @column()
  declare rating: number

  @column()
  declare title: string | null

  @column()
  declare body: string | null

  @column({ consume: (value) => Boolean(value) })
  declare spoiler: boolean

  @column()
  declare helpfulCount: number

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Series)
  declare series: BelongsTo<typeof Series>
}
