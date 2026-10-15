import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { CosmeticKind } from '#config/cosmetics'

export default class Cosmetic extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare kind: CosmeticKind

  @column()
  declare name: string

  @column()
  declare slug: string

  @column()
  declare image: string | null

  @column()
  declare style: string | null

  @column()
  declare requiredLevel: number

  @column()
  declare requiredBadge: string | null

  @column({ consume: (value) => Boolean(value) })
  declare grantOnly: boolean

  @column({ consume: (value) => Boolean(value) })
  declare featured: boolean

  @column({ consume: (value) => Boolean(value) })
  declare active: boolean

  @column()
  declare sortOrder: number

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string
}
