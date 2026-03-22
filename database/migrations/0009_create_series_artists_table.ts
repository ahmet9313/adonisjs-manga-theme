import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'series_artists'

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
        .integer('artist_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('artists')
        .onDelete('CASCADE')
      table.primary(['series_id', 'artist_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
