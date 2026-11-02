import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * View counts (view_service). Additive only; every existing series and chapter starts at 0.
 * - `series.view_count`, `chapters.view_count`: all-time totals, raised by one per visitor, chapter
 *   and day when a chapter or episode opens past every gate;
 * - `series_daily_views`: views per series and calendar day (site time zone, "YYYY-MM-DD"), for
 *   the daily / weekly / monthly "Popüler" lists and the catalog's "Trend" order.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('series', (table) => {
      table.integer('view_count').unsigned().notNullable().defaultTo(0)
      table.index(['view_count'], 'series_view_count_idx')
    })
    this.schema.alterTable('chapters', (table) => {
      table.integer('view_count').unsigned().notNullable().defaultTo(0)
    })
    this.schema.createTable('series_daily_views', (table) => {
      table
        .integer('series_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('series')
        .onDelete('CASCADE')
      table.string('day', 10).notNullable()
      table.integer('views').unsigned().notNullable().defaultTo(0)
      table.primary(['series_id', 'day'])
      // Period totals read a range of days across every series.
      table.index(['day', 'series_id'], 'series_daily_views_day_idx')
    })
  }

  async down() {
    this.schema.dropTable('series_daily_views')
    this.schema.alterTable('chapters', (table) => {
      table.dropColumn('view_count')
    })
    this.schema.alterTable('series', (table) => {
      table.dropIndex(['view_count'], 'series_view_count_idx')
      table.dropColumn('view_count')
    })
  }
}
