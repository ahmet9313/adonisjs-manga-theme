import { BaseModel, column, belongsTo, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import ContentType from '#models/content_type'
import Genre from '#models/genre'
import Author from '#models/author'
import Artist from '#models/artist'
import Chapter from '#models/chapter'

export default class Series extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare slug: string

  @column()
  declare description: string

  @column({
    prepare: (value: string[]) => JSON.stringify(value),
    consume: (value: string) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare alternativeTitles: string[]

  @column({
    prepare: (value: string[]) => JSON.stringify(value),
    consume: (value: string) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare keywords: string[] | null

  @column()
  declare contentTypeId: number

  @column()
  declare status: string

  @column()
  declare translationStatus: string

  @column()
  declare publicationYear: number

  @column()
  declare ageRating: string | null

  @column()
  declare coverImage: string

  @column()
  declare bannerImage: string | null

  @column()
  declare featured: boolean

  @column()
  declare featuredDescription: string | null

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string

  @belongsTo(() => ContentType)
  declare contentType: BelongsTo<typeof ContentType>

  @hasMany(() => Chapter)
  declare chapters: HasMany<typeof Chapter>

  @manyToMany(() => Genre, {
    pivotTable: 'series_genres',
  })
  declare genres: ManyToMany<typeof Genre>

  @manyToMany(() => Author, {
    pivotTable: 'series_authors',
  })
  declare authors: ManyToMany<typeof Author>

  @manyToMany(() => Artist, {
    pivotTable: 'series_artists',
  })
  declare artists: ManyToMany<typeof Artist>
}
