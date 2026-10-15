import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Series from '#models/series'
import type { Rarity } from '#config/rewards'

export default class Card extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare seriesId: number | null

  @column()
  declare name: string

  @column()
  declare image: string

  @column()
  declare rarity: Rarity

  @column({ consume: (value) => Boolean(value) })
  declare active: boolean

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string

  @belongsTo(() => Series)
  declare series: BelongsTo<typeof Series>
}
