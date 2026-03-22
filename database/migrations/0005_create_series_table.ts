import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'series'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('title', 255).notNullable().unique()
      table.string('slug', 255).notNullable().unique()
      table.text('description').notNullable()
      table.json('alternative_titles').notNullable()
      table.json('keywords').nullable()
      table
        .integer('content_type_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('content_types')
        .onDelete('RESTRICT')
      table.string('status', 50).notNullable()
      table.string('translation_status', 50).notNullable()
      table.integer('publication_year').notNullable()
      table.string('age_rating', 10).nullable()
      table.string('cover_image', 255).notNullable().defaultTo('cover.svg')
      table.string('banner_image', 255).nullable()
      table.boolean('featured').notNullable().defaultTo(false)
      table.text('featured_description').nullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')

      table.index('content_type_id')
      table.index('status')
      table.index('featured')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
