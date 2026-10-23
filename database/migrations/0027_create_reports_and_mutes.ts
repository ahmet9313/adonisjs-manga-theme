import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Reports and moderation (config/moderation.ts). Additive only.
 * - `reports`: chapter error reports ("Hata bildir"; guests too) and comment / review complaints
 *   ("Şikâyet et"; members). `target_id` is not a foreign key because the target may be deleted
 *   while its reports stay in the history. `reporter_ip` holds a hash of the address, used only
 *   to stop a guest from sending the same report twice.
 * - `users.muted_until`: the member may not write comments or reviews before this moment. A
 *   DATETIME (not TIMESTAMP) so the far-future "süresiz" value also fits MySQL.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('reports', (table) => {
      table.increments('id')
      table
        .integer('reporter_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.string('reporter_ip', 64).nullable()
      table.string('target_type', 16).notNullable()
      table.integer('target_id').unsigned().notNullable()
      table.string('reason', 32).notNullable()
      table.string('note', 500).nullable()
      table.string('status', 12).notNullable().defaultTo('open')
      table
        .integer('resolved_by')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.timestamp('resolved_at').nullable()
      table.string('resolution', 32).nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      // Moderation queue (per status and kind, newest first) and one target's reports.
      table.index(['status', 'target_type', 'created_at'])
      table.index(['target_type', 'target_id', 'status'])
      table.index(['reporter_id'])
    })

    this.schema.alterTable('users', (table) => {
      table.dateTime('muted_until').nullable()
    })
  }

  async down() {
    this.schema.alterTable('users', (table) => {
      table.dropColumn('muted_until')
    })
    this.schema.dropTable('reports')
  }
}
