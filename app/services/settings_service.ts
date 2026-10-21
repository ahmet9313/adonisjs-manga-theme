import db from '@adonisjs/lucid/services/db'
import site, { agePolicyKeys, coverModeKeys, type AgePolicy, type CoverMode } from '#config/site'
import { roleNames, roles, type Role } from '#config/roles'
import { now } from '#services/input_service'
import theme from '#services/theme_service'

/** Values the administrator can change under Admin → Tema / Roller. Everything is a string. */
const defaults: Record<string, string> = {
  site_name: site.name,
  site_description: site.description,
  logo_url: site.logo || '',
  logo_mobile_url: '',
  favicon_url: '',
  ...Object.fromEntries(
    Object.entries(site.agePolicies).map(([rating, policy]) => [agePolicyKey(rating), policy])
  ),
  ...Object.fromEntries(
    Object.entries(site.coverPolicies).map(([rating, mode]) => [coverPolicyKey(rating), mode])
  ),
  cover_placeholder_url: '',
  /** Who sees the real hidden covers (config/site.ts → coverReveals). */
  cover_reveal: 'age',
  announcement_enabled: '',
  announcement_text: '',
  announcement_url: '',
}

/** Settings key of an age rating's policy: `age_policy_18` for "18+". */
export function agePolicyKey(rating: string) {
  return `age_policy_${rating.replace(/\D/g, '')}`
}

/** Settings key of an age rating's cover rule: `cover_policy_18` for "18+". */
export function coverPolicyKey(rating: string) {
  return `cover_policy_${rating.replace(/\D/g, '')}`
}

/** Key/value settings kept in the `settings` table and cached for the life of the process. */
class SettingsService {
  private values = new Map<string, string>()
  private loading: Promise<void> | null = null

  /** Loads the table once; call from a middleware before rendering. */
  async ready() {
    // A failed first load is forgotten so the next request retries it.
    this.loading ??= this.reload().catch((error) => {
      this.loading = null
      throw error
    })
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
      style: `--role:${color};color:${color};border-color:${color}66;background-color:${color}26`,
    }
  }

  allRoles() {
    return roleNames.map((key) => ({ key, ...this.role(key) }))
  }

  /** What happens before a series with this age rating opens (config/site.ts → agePolicies). */
  agePolicy(rating: string | null | undefined): AgePolicy {
    if (!rating) return 'none'
    const value = this.get(agePolicyKey(rating)) as AgePolicy
    return agePolicyKeys.includes(value) ? value : 'none'
  }

  /** How covers of this age rating are shown (config/site.ts → coverPolicies). */
  coverPolicy(rating: string | null | undefined): CoverMode {
    if (!rating) return 'show'
    const value = this.get(coverPolicyKey(rating)) as CoverMode
    return coverModeKeys.includes(value) ? value : 'show'
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
    site.logoMobile = this.get('logo_mobile_url') || null
    site.favicon = this.get('favicon_url') || null

    theme.apply((key) => this.values.get(key) ?? '')
  }
}

export default new SettingsService()
