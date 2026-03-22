import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import Series from '#models/series'

export default class Artist extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare slug: string

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string

  @manyToMany(() => Series, {
    pivotTable: 'series_artists',
  })
  declare series: ManyToMany<typeof Series>
}
