import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Series from '#models/series'

export default class Bookmark extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare seriesId: number

  @column()
  declare createdAt: string

  @belongsTo(() => Series)
  declare series: BelongsTo<typeof Series>
}
