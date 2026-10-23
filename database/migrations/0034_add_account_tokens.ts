import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Password reset and e-mail verification. Additive only.
 *
 * - `users.email_verified_at`: accounts that existed before this migration count as verified
 *   (filled with the migration time), so nobody is locked out of anything.
 * - `account_tokens`: one row per mailed link. Only the SHA-256 of the random token is stored;
 *   the link itself is never saved. `email` is the address the link was sent to (a verification
 *   link stops working once the account's address changes again). Links are single use
 *   (`used_at`) and expire (`expires_at`).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('users', (table) => {
      table.timestamp('email_verified_at').nullable()
    })
    this.defer(async (db) => {
      await db
        .from('users')
        .whereNull('email_verified_at')
        .update({ email_verified_at: new Date().toISOString().slice(0, 19).replace('T', ' ') })
    })

    this.schema.createTable('account_tokens', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('type', 20).notNullable()
      table.string('token_hash', 64).notNullable().unique()
      table.string('email', 255).nullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('used_at').nullable()
      table.timestamp('created_at').notNullable()
      table.index(['user_id', 'type'], 'account_tokens_user_type_idx')
      table.index(['expires_at'], 'account_tokens_expires_idx')
    })
  }

  async down() {
    this.schema.dropTable('account_tokens')
    this.schema.alterTable('users', (table) => {
      table.dropColumn('email_verified_at')
    })
  }
}
