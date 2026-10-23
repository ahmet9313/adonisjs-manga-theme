import { BaseModel, column } from '@adonisjs/lucid/orm'

/** Static page (`/sayfa/:slug`) with a Markdown body; see app/services/markdown_service.ts. */
export default class Page extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare slug: string

  @column()
  declare body: string

  /** Listed in the footer's "Bilgi" column (published pages only). */
  @column({ consume: (value) => Boolean(value) })
  declare showInFooter: boolean

  /** Footer and admin order, ascending. */
  @column()
  declare sort: number

  @column({ consume: (value) => Boolean(value) })
  declare published: boolean

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string
}
