import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Drafts and restricted content (config/site.ts → accessLevels). Additive only; every existing
 * series and chapter stays published and open to everyone.
 * - `series.draft`, `chapters.draft`: only staff see drafts; lists and counts leave them out.
 * - `series.access`, `chapters.access`: `public`, `members` or `vip`. A chapter is as strict as
 *   the stricter of itself and its series (`public` on a chapter means "same as the series").
 * - `chapters.warning`: optional notice shown before the chapter opens.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('series', (table) => {
      table.boolean('draft').notNullable().defaultTo(false)
      table.string('access', 10).notNullable().defaultTo('public')
    })
    this.schema.alterTable('chapters', (table) => {
      table.boolean('draft').notNullable().defaultTo(false)
      table.string('access', 10).notNullable().defaultTo('public')
      table.string('warning', 500).nullable()
    })
  }

  async down() {
    this.schema.alterTable('chapters', (table) => {
      table.dropColumns('draft', 'access', 'warning')
    })
    this.schema.alterTable('series', (table) => {
      table.dropColumns('draft', 'access')
    })
  }
}
