import { BaseSchema } from '@adonisjs/lucid/schema'
import { refreshSearchText } from '#services/search_index_service'

/**
 * `series.search_text`: folded title, address, alternative titles, authors and artists for the
 * Turkish-aware search (see search_index_service). Additive; existing series are filled in here,
 * 200 rows at a time.
 */
export default class extends BaseSchema {
  protected tableName = 'series'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('search_text').nullable()
    })
    this.defer(async (db) => {
      await refreshSearchText('all', db)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('search_text')
    })
  }
}
