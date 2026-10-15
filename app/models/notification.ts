import { BaseModel, column } from '@adonisjs/lucid/orm'

export type NotificationCategory = 'system' | 'reward' | 'activity' | 'chapter'

export default class Notification extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare category: NotificationCategory

  @column()
  declare title: string

  @column()
  declare body: string

  @column()
  declare link: string | null

  @column()
  declare readAt: string | null

  @column()
  declare createdAt: string
}
