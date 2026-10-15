import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ReviewVote extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare reviewId: number

  @column()
  declare createdAt: string
}
