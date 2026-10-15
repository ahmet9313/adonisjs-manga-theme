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
}
