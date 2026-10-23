import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * "Bölüm nasıldı?" reactions and comment edits. Additive only.
 * - `chapter_reactions`: one reaction per member and chapter (config/site.ts → chapterReactions);
 *   counts are a grouped query on the (chapter_id, user_id) unique index.
 * - `comments.edited_at`: set when the author edits the text or the spoiler flag.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('chapter_reactions', (table) => {
      table.increments('id')
      table
        .integer('chapter_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('chapters')
        .onDelete('CASCADE')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('reaction', 16).notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.unique(['chapter_id', 'user_id'])
      table.index(['user_id'])
    })

    this.schema.alterTable('comments', (table) => {
      table.timestamp('edited_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable('comments', (table) => {
      table.dropColumn('edited_at')
    })
    this.schema.dropTable('chapter_reactions')
  }
}
