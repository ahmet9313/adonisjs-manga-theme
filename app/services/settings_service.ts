import db from '@adonisjs/lucid/services/db'
import site from '#config/site'
import { roleNames, roles, type Role } from '#config/roles'
import { now } from '#services/input_service'
import theme from '#services/theme_service'

/** Values the administrator can change under Admin → Tema / Roller. Everything is a string. */
const defaults: Record<string, string> = {
  site_name: site.name,
  site_description: site.description,
  logo_url: site.logo || '',
  announcement_enabled: '',
  announcement_text: '',
  announcement_url: '',
}

/** Key/value settings kept in the `settings` table and cached for the life of the process. */
class SettingsService {
  private values = new Map<string, string>()
  private loading: Promise<void> | null = null

  /** Loads the table once; call from a middleware before rendering. */
  async ready() {
    this.loading ??= this.reload()
    return this.loading
  }

  async reload() {
    const rows = await db.from('settings').select('key', 'value')
    this.values = new Map(rows.map((row) => [row.key as string, row.value as string]))
    this.apply()
  }

  get(key: string): string {
    return this.values.get(key) ?? defaults[key] ?? ''
  }

  /** Writes the given keys in one transaction and refreshes the cache. */
  async save(entries: Record<string, string>) {
    const stamp = now()
    await db.transaction(async (trx) => {
      for (const [key, value] of Object.entries(entries)) {
        // An empty value means "back to the default", so the row is dropped.
        if (value === '') await trx.from('settings').where('key', key).delete()
        else
          await trx
            .table('settings')
            .insert({ key, value, updated_at: stamp })
            .onConflict('key')
            .merge(['value', 'updated_at'])
      }
    })
    await this.reload()
  }

  /** Name, colour and badge style of a role, including the administrator's overrides. */
  role(role: Role) {
    const base = roles[role]
    const label = this.values.get(`role_${role}_label`) || base.label
    const color = this.values.get(`role_${role}_color`) || base.color
    return {
      label,
      color,
      style: `color:${color};border-color:${color}66;background-color:${color}26`,
    }
  }

  allRoles() {
    return roleNames.map((key) => ({ key, ...this.role(key) }))
  }

  announcement() {
    const text = this.get('announcement_text')
    if (!this.get('announcement_enabled') || !text) return null
    return { text, url: this.get('announcement_url') }
  }

  private apply() {
    // `site` is read by every view; keep its fields in step with the saved values.
    site.name = this.get('site_name') || defaults.site_name
    site.description = this.get('site_description') || defaults.site_description
    site.logo = this.get('logo_url') || null

    theme.apply((key) => this.values.get(key) ?? '')
  }
}

export default new SettingsService()
