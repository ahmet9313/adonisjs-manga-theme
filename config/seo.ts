import env from '#start/env'

/**
 * Search engines, link previews and feeds (app/services/seo_service.ts, seo_controller.ts).
 *
 * The site address is never hard-coded: Admin → Tema → Genel → "Site adresi" wins, then
 * `APP_URL` in .env, and without either the address the visitor used (protocol + host).
 */
const seo = {
  /** Optional fixed address from .env (`APP_URL=https://example.com`); no path, no trailing slash. */
  appUrl: (env.get('APP_URL') || '').replace(/\/+$/, ''),
  /** Open Graph locale of every page. */
  locale: 'tr_TR',
  /** Sitemap and feed rows are kept in memory this long (minutes); edits show up after it. */
  sitemapMinutes: 10,
  feedMinutes: 5,
  /** Items in /rss.xml and in each series feed. */
  feedSize: 50,
  /** URLs per sitemap file; above it /sitemap.xml becomes an index of /sitemaps/<n>.xml. */
  sitemapPageSize: 45000,
  /** Open Graph / Twitter descriptions are cut to this many characters. */
  descriptionLength: 200,
  /**
   * Pages that are personal, for accounts or JSON endpoints: `noindex` and `Disallow` in
   * robots.txt. A path matches itself and everything under it (`/admin`, `/admin/...`).
   */
  privatePaths: [
    '/admin',
    '/ayarlar',
    '/giris',
    '/kayit',
    '/cikis',
    '/bildirimler',
    '/kaydedilenler',
    '/kutuphane',
    '/gecmis',
    '/oneriler',
    '/oduller',
    '/rozetler',
    '/kartlar',
    '/envanter',
    '/kozmetik',
    '/gunluk-giris',
    '/yas-onayi',
    '/ara',
    '/yorumlar',
    '/incelemeler',
  ],
  /** Query parameters that never change a page (dropped from canonical addresses). */
  trackingParams: /^(utm_\w+|fbclid|gclid|yclid|msclkid|ref|igshid)$/i,
}

export default seo
