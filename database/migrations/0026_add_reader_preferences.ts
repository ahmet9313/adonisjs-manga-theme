import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Reader settings and reading position for accounts. Additive only:
 * - `users.reader_prefs`: the reading settings as JSON (app/services/reader_service.ts →
 *   normalizePrefs), so they follow the reader across devices; null until first changed;
 * - `chapter_reads.last_page`: the page last seen in that chapter (1-based), null when unknown.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('users', (table) => {
      table.text('reader_prefs').nullable()
    })
    this.schema.alterTable('chapter_reads', (table) => {
      table.integer('last_page').unsigned().nullable()
    })
  }

  async down() {
    this.schema.alterTable('chapter_reads', (table) => {
      table.dropColumn('last_page')
    })
    this.schema.alterTable('users', (table) => {
      table.dropColumn('reader_prefs')
    })
  }
}
