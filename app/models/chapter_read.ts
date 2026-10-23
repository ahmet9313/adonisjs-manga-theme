import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ChapterRead extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare seriesId: number

  @column()
  declare chapterId: number

  @column()
  declare readAt: string

  /** Page last seen in the chapter (1-based); null when unknown. */
  @column()
  declare lastPage: number | null

  /** Marked read by hand (not opened); see migration 0025. */
  @column({ consume: (value) => Boolean(value) })
  declare marked: boolean
}
