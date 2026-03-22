import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'series_genres'

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
        .integer('genre_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('genres')
        .onDelete('CASCADE')
      table.primary(['series_id', 'genre_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
