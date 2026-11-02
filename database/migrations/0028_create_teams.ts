import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Translation (fansub) teams (config/teams.ts). Additive only.
 * - `teams`: name, address, description, logo, links and the recruitment notice.
 * - `team_members`: a user's role in a team (one row per role; `sort` keeps the admin's order).
 * - `series_teams`: default teams of a series; `chapter_teams`: teams of one chapter. A chapter
 *   without its own teams is credited to the series' teams.
 * - `chapters.credits`: optional free-text credit line ("Çeviri: X · Edit: Y").
 * Deleting a team only detaches it (the rows above cascade); series and chapters stay.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('teams', (table) => {
      table.increments('id')
      table.string('name', 80).notNullable().unique()
      table.string('slug', 80).notNullable().unique()
      table.text('description').nullable()
      table.string('logo', 255).nullable()
      table.string('discord_url', 500).nullable()
      table.string('website_url', 500).nullable()
      table.string('other_url', 500).nullable()
      table.boolean('recruiting').notNullable().defaultTo(false)
      table.text('recruitment_text').nullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })

    this.schema.createTable('team_members', (table) => {
      table.increments('id')
      table
        .integer('team_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('teams')
        .onDelete('CASCADE')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('role', 20).notNullable()
      table.integer('sort').notNullable().defaultTo(0)
      table.unique(['team_id', 'user_id', 'role'])
      table.index(['user_id'])
    })

    for (const [name, owner, ownerTable] of [
      ['series_teams', 'series_id', 'series'],
      ['chapter_teams', 'chapter_id', 'chapters'],
    ] as const) {
      this.schema.createTable(name, (table) => {
        table.increments('id')
        table
          .integer(owner)
          .unsigned()
          .notNullable()
          .references('id')
          .inTable(ownerTable)
          .onDelete('CASCADE')
        table
          .integer('team_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('teams')
          .onDelete('CASCADE')
        table.integer('sort').notNullable().defaultTo(0)
        table.unique([owner, 'team_id'])
        table.index(['team_id'])
      })
    }

    this.schema.alterTable('chapters', (table) => {
      table.string('credits', 200).nullable()
    })
  }

  async down() {
    this.schema.alterTable('chapters', (table) => {
      table.dropColumn('credits')
    })
    this.schema.dropTable('chapter_teams')
    this.schema.dropTable('series_teams')
    this.schema.dropTable('team_members')
    this.schema.dropTable('teams')
  }
}
