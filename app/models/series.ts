import { BaseModel, beforeSave, column, belongsTo, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import ContentType from '#models/content_type'
import Genre from '#models/genre'
import Author from '#models/author'
import Artist from '#models/artist'
import Chapter from '#models/chapter'
import type { AccessLevel, SeriesCoverMode } from '#config/site'
import { searchTextFor } from '#services/search_index_service'

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

  /** Drafts are only visible to staff (series lists, counts and pages leave them out). */
  @column({ consume: (value) => Boolean(value) })
  declare draft: boolean

  /** Who may open the chapters: everyone, members or VIP members (config/site.ts). */
  @column()
  declare access: AccessLevel

  /** `auto` follows the age rating's cover rule; see cover_policy_service. */
  @column()
  declare coverMode: SeriesCoverMode

  @column()
  declare featuredDescription: string | null

  /** Denormalised from `series_reviews` (see review_service). */
  @column({ consume: (value) => Number(value) || 0 })
  declare ratingAvg: number

  @column()
  declare ratingCount: number

  @column()
  declare reviewCount: number

  /** Folded names for Turkish-aware search (search_index_service); never shown. */
  @column({ serializeAs: null })
  declare searchText: string | null

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string

  /** Keeps `search_text` in step with the names; authors/artists refresh it after a sync. */
  @beforeSave()
  static async indexSearchText(series: Series) {
    const dirty = series.$dirty
    if (!('title' in dirty || 'slug' in dirty || 'alternativeTitles' in dirty)) return
    series.searchText = await searchTextFor(
      {
        id: series.$isPersisted ? series.id : undefined,
        title: series.title,
        slug: series.slug,
        alternativeTitles: series.alternativeTitles,
      },
      series.$trx
    )
  }

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
