import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Series from '#models/series'
import type { ContentFormat } from '#config/site'

export default class ContentType extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare slug: string

  /** How chapters are made and shown (config/site.ts → contentFormats). */
  @column()
  declare format: ContentFormat

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string

  @hasMany(() => Series)
  declare series: HasMany<typeof Series>
}
