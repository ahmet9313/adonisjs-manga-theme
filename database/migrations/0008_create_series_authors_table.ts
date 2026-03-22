import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'series_authors'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table
        .integer('series_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('series')
        .onDelete('CASCADE')
      table
        .integer('author_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('authors')
        .onDelete('CASCADE')
      table.primary(['series_id', 'author_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
