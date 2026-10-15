import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class CommentLike extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare commentId: number

  /** +1 up-vote, -1 down-vote. */
  @column()
  declare value: number

  @column()
  declare createdAt: string
}
