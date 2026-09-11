import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('series', (table) => {
      table.index(['updated_at', 'id'], 'series_recent_idx')
      table.index(['created_at', 'id'], 'series_newest_idx')
    })
    this.schema.alterTable('chapters', (table) => table.index('created_at', 'chapters_recent_idx'))
    this.schema.alterTable('series_genres', (table) =>
      table.index(['genre_id', 'series_id'], 'genres_series_idx')
    )
  }

  async down() {
    this.schema.alterTable('series', (table) => {
      table.dropIndex(['updated_at', 'id'], 'series_recent_idx')
      table.dropIndex(['created_at', 'id'], 'series_newest_idx')
    })
    this.schema.alterTable('chapters', (table) =>
      table.dropIndex('created_at', 'chapters_recent_idx')
    )
    this.schema.alterTable('series_genres', (table) =>
      table.dropIndex(['genre_id', 'series_id'], 'genres_series_idx')
    )
  }
}
