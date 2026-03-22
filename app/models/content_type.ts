import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Series from '#models/series'

export default class ContentType extends BaseModel {
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

  @hasMany(() => Series)
  declare series: HasMany<typeof Series>
}
