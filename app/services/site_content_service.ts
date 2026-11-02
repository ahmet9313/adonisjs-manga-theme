import db from '@adonisjs/lucid/services/db'
import site from '#config/site'
import settings from '#services/settings_service'
import { slugify } from '#services/input_service'

/** Settings key of a social account (config/site.ts → socialNetworks): `social_discord`. */
export const socialKey = (network: string) => `social_${network}`
export const DISCLAIMER_KEY = 'footer_disclaimer'
/** Plain cookie written when the visitor dismisses the cookie notice (JS or the fallback form). */
export const COOKIE_NOTICE_COOKIE = 'cookie_ok'
export const COOKIE_NOTICE_MAX_AGE = 365 * 24 * 60 * 60
/** Longest page and announcement bodies (characters). */
export const PAGE_BODY_LIMIT = 20000
export const POST_BODY_LIMIT = 10000

export interface FooterPage {
  title: string
  slug: string
}

/**
 * Footer content shared by every page: links to published static pages (cached for the life of
 * the process and dropped whenever a page is saved or deleted), the disclaimer and the social
 * accounts set under Admin → Tema → Genel.
 */
class SiteContentService {
  private footer: Promise<{ links: FooterPage[]; published: Set<string> }> | null = null

  private load() {
    // A failed load is forgotten so the next request retries it.
    this.footer ??= db
      .from('pages')
      .where('published', true)
      .orderBy('sort', 'asc')
      .orderBy('id', 'asc')
      .select('title', 'slug', 'show_in_footer')
      .then((rows) => ({
        links: rows
          .filter((row) => Boolean(row.show_in_footer))
          .map((row) => ({ title: String(row.title), slug: String(row.slug) })),
        published: new Set(rows.map((row) => String(row.slug))),
      }))
      .catch((error) => {
        this.footer = null
        throw error
      })
    return this.footer
  }

  /** Call after any page write. */
  forget() {
    this.footer = null
  }

  /** Published pages marked "show in footer", in order. */
  async footerPages(): Promise<FooterPage[]> {
    const footer = await this.load()
    return footer.links
  }

  /** Address of a published page, or null (e.g. the privacy page for the cookie notice). */
  async pageUrl(slug: string): Promise<string | null> {
    const footer = await this.load()
    return footer.published.has(slug) ? `/sayfa/${slug}` : null
  }

  disclaimer() {
    return settings.get(DISCLAIMER_KEY) || site.disclaimer
  }

  /** Config links first, then the accounts filled in under Admin → Tema → Genel. */
  socialLinks(): { key: string; label: string; url: string }[] {
    return [
      ...site.socialLinks.map((entry) => ({ key: slugify(entry.label), ...entry })),
      ...site.socialNetworks
        .map((network) => ({
          key: network.key,
          label: network.label,
          url: settings.get(socialKey(network.key)),
        }))
        .filter((entry) => entry.url),
    ]
  }

  discordUrl() {
    return settings.get(socialKey('discord')) || null
  }
}

export default new SiteContentService()
