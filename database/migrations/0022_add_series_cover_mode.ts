import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * How a series' cover is shown on the site (config/site.ts → coverModes). Additive only; every
 * existing series follows its age rating (`auto`), as set under Admin → Tema → Yaş ve Erişim.
 * - `auto`: the rule of the series' age rating (cover_policy_18 …);
 * - `show` / `blur` / `placeholder`: always shown, blurred or replaced by the default image.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('series', (table) => {
      table.string('cover_mode', 12).notNullable().defaultTo('auto')
    })
  }

  async down() {
    this.schema.alterTable('series', (table) => {
      table.dropColumn('cover_mode')
    })
  }
}
