import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Series from '#models/series'
import type { VideoSource } from '#config/watch'
import type { AccessLevel } from '#config/site'

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
  declare content:
    | { type: 'images'; pages: string[] }
    | { type: 'text'; text: string }
    | { type: 'video'; sources: VideoSource[] }

  @column()
  declare publishedAt: string

  /** Only staff see draft chapters; readers are told about a chapter when it is published. */
  @column({ consume: (value) => Boolean(value) })
  declare draft: boolean

  /** Stricter of this and the series' access counts; `public` means "same as the series". */
  @column()
  declare access: AccessLevel

  /** Optional notice the reader confirms before the chapter opens. */
  @column()
  declare warning: string | null

  /** Optional free-text credit line ("Çeviri: X · Edit: Y"); teams are in `chapter_teams`. */
  @column()
  declare credits: string | null

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string

  @belongsTo(() => Series)
  declare series: BelongsTo<typeof Series>
}
