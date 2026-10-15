import { BaseSchema } from '@adonisjs/lucid/schema'

/** Account-bound bookmarks and per-chapter reading history. */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('bookmarks', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .integer('series_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('series')
        .onDelete('CASCADE')
      table.timestamp('created_at')
      table.unique(['user_id', 'series_id'])
    })

    this.schema.createTable('chapter_reads', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .integer('series_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('series')
        .onDelete('CASCADE')
      table
        .integer('chapter_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('chapters')
        .onDelete('CASCADE')
      table.timestamp('read_at').notNullable()
      table.unique(['user_id', 'chapter_id'])
      table.index(['user_id', 'series_id', 'read_at'])
    })
  }

  async down() {
    this.schema.dropTable('chapter_reads')
    this.schema.dropTable('bookmarks')
  }
}
