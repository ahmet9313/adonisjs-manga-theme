import { BaseModel, column } from '@adonisjs/lucid/orm'

/** Translation (fansub) team; members and credits live in pivot tables (team_service). */
export default class Team extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare slug: string

  @column()
  declare description: string | null

  /** Uploaded logo (/content/teams/<slug>/<uuid>.<ext>) or null. */
  @column()
  declare logo: string | null

  @column()
  declare discordUrl: string | null

  @column()
  declare websiteUrl: string | null

  @column()
  declare otherUrl: string | null

  /** Shown on /ekibe-katil with `recruitmentText`. */
  @column({ consume: (value) => Boolean(value) })
  declare recruiting: boolean

  @column()
  declare recruitmentText: string | null

  @column()
  declare createdAt: string

  @column()
  declare updatedAt: string
}
