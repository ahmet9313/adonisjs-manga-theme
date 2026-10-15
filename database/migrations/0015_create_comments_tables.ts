import { BaseSchema } from '@adonisjs/lucid/schema'

/** Threaded comments (series or chapter level) with optional image/GIF and likes. */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('comments', (table) => {
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
        .nullable()
        .references('id')
        .inTable('chapters')
        .onDelete('CASCADE')
      table
        .integer('parent_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('comments')
        .onDelete('CASCADE')
      table.integer('root_id').unsigned().nullable()
      table.integer('depth').unsigned().notNullable().defaultTo(0)
      table.text('body').notNullable()
      table.string('image', 255).nullable()
      table.boolean('spoiler').notNullable().defaultTo(false)
      table.integer('like_count').unsigned().notNullable().defaultTo(0)
      table.integer('reply_count').unsigned().notNullable().defaultTo(0)
      table.timestamp('deleted_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['series_id', 'chapter_id', 'parent_id', 'created_at'])
      table.index(['parent_id', 'created_at'])
      table.index(['user_id', 'created_at'])
    })

    this.schema.createTable('comment_likes', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .integer('comment_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('comments')
        .onDelete('CASCADE')
      table.timestamp('created_at').notNullable()
      table.unique(['user_id', 'comment_id'])
    })
  }

  async down() {
    this.schema.dropTable('comment_likes')
    this.schema.dropTable('comments')
  }
}
