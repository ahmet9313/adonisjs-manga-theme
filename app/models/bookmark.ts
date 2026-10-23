import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Series from '#models/series'
import type { LibraryStatus } from '#config/site'

export default class Bookmark extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare seriesId: number

  @column()
  declare status: LibraryStatus

  @column()
  declare createdAt: string

  @belongsTo(() => Series)
  declare series: BelongsTo<typeof Series>
}
