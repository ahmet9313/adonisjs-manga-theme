import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'chapters'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('series_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('series')
        .onDelete('CASCADE')
      table.integer('number').notNullable()
      table.string('title', 255).nullable()
      table.json('content').notNullable()
      table.date('published_at').notNullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')

      table.unique(['series_id', 'number'])
      table.index('series_id')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
