import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Ratings and written reviews. Only adds tables and series columns; nothing existing is changed.
 * `series.rating_*` are denormalised so catalog cards and sorting never aggregate on the fly.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('series', (table) => {
      table.decimal('rating_avg', 4, 2).notNullable().defaultTo(0)
      table.integer('rating_count').unsigned().notNullable().defaultTo(0)
      table.integer('review_count').unsigned().notNullable().defaultTo(0)
    })

    this.schema.createTable('series_reviews', (table) => {
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
      // 1–10; a rating may come without any text.
      table.integer('rating').unsigned().notNullable()
      table.string('title', 80).nullable()
      table.text('body').nullable()
      table.boolean('spoiler').notNullable().defaultTo(false)
      table.integer('helpful_count').unsigned().notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.unique(['user_id', 'series_id'])
      table.index(['series_id', 'created_at'])
      table.index(['series_id', 'helpful_count'])
    })

    this.schema.createTable('review_votes', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .integer('review_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('series_reviews')
        .onDelete('CASCADE')
      table.timestamp('created_at').notNullable()
      table.unique(['user_id', 'review_id'])
    })
  }

  async down() {
    this.schema.dropTable('review_votes')
    this.schema.dropTable('series_reviews')
    this.schema.alterTable('series', (table) => {
      table.dropColumns('rating_avg', 'rating_count', 'review_count')
    })
  }
}
