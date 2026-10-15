import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('username', 32).nullable().unique()
      table.string('role', 20).notNullable().defaultTo('member')
      table.string('avatar', 255).nullable()
      table.string('banner', 255).nullable()
      table.text('bio').nullable()
      table.timestamp('banned_at').nullable()
      table.timestamp('last_login_at').nullable()
    })

    // Every account that existed before roles were introduced was an administrator.
    this.defer(async (db) => {
      const users = await db.from(this.tableName).select('id', 'email').orderBy('id')
      const taken = new Set<string>()
      for (const user of users) {
        const base =
          String(user.email)
            .split('@')[0]
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 24) || 'uye'
        let username = base.length >= 3 ? base : `${base}_${user.id}`
        while (taken.has(username)) username = `${base.slice(0, 20)}_${user.id}`
        taken.add(username)
        await db.from(this.tableName).where('id', user.id).update({ username, role: 'admin' })
      }
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['username'])
      table.dropColumns('username', 'role', 'avatar', 'banner', 'bio', 'banned_at', 'last_login_at')
    })
  }
}
