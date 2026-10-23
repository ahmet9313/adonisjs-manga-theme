import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Admin power tools. Additive only.
 * - `series.pinned`: kept at the top of the home page "Son Güncellenenler" list.
 * - `admin_logs`: who changed what in the panel (series, chapters, roles, theme, bulk uploads).
 *   Rows older than `adminTools.logRetentionDays` are pruned by admin_log_service.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('series', (table) => {
      table.boolean('pinned').notNullable().defaultTo(false)
    })
    this.schema.createTable('admin_logs', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.string('action', 30).notNullable()
      table.string('target_type', 30).notNullable()
      table.integer('target_id').nullable()
      table.string('summary', 500).notNullable()
      table.timestamp('created_at').notNullable()
      table.index(['created_at', 'id'])
      table.index(['user_id'])
      table.index(['target_type', 'target_id'])
    })
  }

  async down() {
    this.schema.dropTable('admin_logs')
    this.schema.alterTable('series', (table) => {
      table.dropColumn('pinned')
    })
  }
}
