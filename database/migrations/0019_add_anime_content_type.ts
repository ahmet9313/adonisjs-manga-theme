import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Adds the "Anime" content type whose chapters are video episodes (see config/watch.ts).
 * Additive only: nothing is inserted when the slug or name is already taken, and `down`
 * keeps the row while any series still uses it.
 */
export default class extends BaseSchema {
  protected tableName = 'content_types'

  async up() {
    this.defer(async (db) => {
      const existing = await db
        .from(this.tableName)
        .where('slug', 'anime')
        .orWhere('name', 'Anime')
        .first()
      if (existing) return
      const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
      await db.table(this.tableName).insert({
        name: 'Anime',
        slug: 'anime',
        created_at: timestamp,
        updated_at: timestamp,
      })
    })
  }

  async down() {
    this.defer(async (db) => {
      const row = await db.from(this.tableName).where('slug', 'anime').first()
      if (!row) return
      const used = await db.from('series').where('content_type_id', row.id).first()
      if (used) return
      await db.from(this.tableName).where('id', row.id).delete()
    })
  }
}
