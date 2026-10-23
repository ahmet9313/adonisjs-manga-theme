import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Scheduled publishing and release days. Additive only; nothing existing changes.
 * - `series.publish_at`, `chapters.publish_at`: a draft with a time (UTC "YYYY-MM-DD HH:mm:ss",
 *   like every other timestamp) is published by the scheduler (publishing_service.publishDue)
 *   once the time has come; publishing clears it.
 * - `series.release_days`: weekday keys of new chapters, comma separated ("cum,cmt,paz", see
 *   config/calendar.ts); `series.release_note`: optional free text ("Her cuma 20.00'de").
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('series', (table) => {
      table.timestamp('publish_at').nullable()
      table.string('release_days', 40).nullable()
      table.string('release_note', 80).nullable()
      table.index(['draft', 'publish_at'], 'series_draft_publish_at_index')
    })
    this.schema.alterTable('chapters', (table) => {
      table.timestamp('publish_at').nullable()
      table.index(['draft', 'publish_at'], 'chapters_draft_publish_at_index')
    })
  }

  async down() {
    this.schema.alterTable('chapters', (table) => {
      table.dropIndex(['draft', 'publish_at'], 'chapters_draft_publish_at_index')
      table.dropColumns('publish_at')
    })
    this.schema.alterTable('series', (table) => {
      table.dropIndex(['draft', 'publish_at'], 'series_draft_publish_at_index')
      table.dropColumns('publish_at', 'release_days', 'release_note')
    })
  }
}
