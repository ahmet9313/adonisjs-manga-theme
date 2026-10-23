import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Reading statuses and hand-made read marks (reading_list_service). Additive only.
 * - `bookmarks.status`: Okuyorum / Daha sonra / Bitirdim / Beklemede / Bıraktım
 *   (config/site.ts → libraryStatuses); every existing bookmark becomes `reading`.
 * - `chapter_reads.marked`: the row comes from "Okundu işaretle" / "Tümünü okundu işaretle", not
 *   from opening the chapter. Such rows count for the reading list and "continue reading" but not
 *   for badges or "Ayın okurları"; opening the chapter later turns it into a real read.
 * - `unmarked_reads`: chapters an account opened and later marked unread. Opening them again
 *   gives no second read reward (EXP, card), so unmarking cannot be used to farm rewards.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('bookmarks', (table) => {
      table.string('status', 16).notNullable().defaultTo('reading')
    })
    this.schema.alterTable('chapter_reads', (table) => {
      table.boolean('marked').notNullable().defaultTo(false)
    })
    this.schema.createTable('unmarked_reads', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .integer('chapter_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('chapters')
        .onDelete('CASCADE')
      table.timestamp('created_at').notNullable()
      table.unique(['user_id', 'chapter_id'])
      table.index(['chapter_id'], 'unmarked_reads_chapter_idx')
    })
  }

  async down() {
    this.schema.dropTable('unmarked_reads')
    this.schema.alterTable('chapter_reads', (table) => {
      table.dropColumn('marked')
    })
    this.schema.alterTable('bookmarks', (table) => {
      table.dropColumn('status')
    })
  }
}
