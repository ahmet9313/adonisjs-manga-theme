import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Adds `content_types.format`: how a type's chapters are made and shown — `image` (pages:
 * manga, manhwa, webtoon …), `text` (novel) or `video` (anime). Additive only. Existing rows
 * get the format the code used to infer from the slug: `novel` → text, `anime` → video.
 */
export default class extends BaseSchema {
  protected tableName = 'content_types'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('format', 10).notNullable().defaultTo('image')
    })
    this.defer(async (db) => {
      await db.from(this.tableName).where('slug', 'novel').update({ format: 'text' })
      await db.from(this.tableName).where('slug', 'anime').update({ format: 'video' })
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('format')
    })
  }
}
