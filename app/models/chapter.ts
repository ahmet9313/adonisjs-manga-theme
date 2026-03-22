import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Series from '#models/series'

export default class Chapter extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare seriesId: number

  @column()
  declare number: number

  @column()
  declare title: string | null

  @column({
    prepare: (value: any) => JSON.stringify(value),
    consume: (value: string) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare content: { type: 'images'; pages: string[] } | { type: 'text'; text: string }

  @column()
  declare publishedAt: string

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string

  @belongsTo(() => Series)
  declare series: BelongsTo<typeof Series>
}
