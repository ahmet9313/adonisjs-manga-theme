import type { HttpContext } from '@adonisjs/core/http'
import site from '#config/site'
import seoConfig from '#config/seo'
import seo from '#services/seo_service'
import feeds from '#services/feed_service'
import seriesService from '#services/series_service'

/** robots.txt, sitemaps and RSS feeds (config/seo.ts, feed_service). */
export default class SeoController {
  /** GET /robots.txt: the site is open except account pages, the panel and JSON endpoints. */
  async robots({ request, response }: HttpContext) {
    const lines = [
      'User-agent: *',
      'Allow: /',
      ...seoConfig.privatePaths.map((path) => `Disallow: ${path}`),
      '',
      `Sitemap: ${seo.url(request, '/sitemap.xml')}`,
      '',
    ]
    response.header('Content-Type', 'text/plain; charset=utf-8')
    response.header('Cache-Control', 'public, max-age=3600')
    return lines.join('\n')
  }

  /** GET /sitemap.xml: one `<urlset>`, or an index of /sitemaps/<n>.xml for large catalogs. */
  async sitemap({ request, response }: HttpContext) {
    const entries = await feeds.sitemap()
    const origin = seo.origin(request)
    const pages = Math.ceil(entries.length / seoConfig.sitemapPageSize)
    this.xml(response, 'application/xml')
    return pages > 1 ? feeds.sitemapIndex(pages, origin) : feeds.urlset(entries, origin)
  }

  /** GET /sitemaps/:file (`2.xml`): one part of a large sitemap. */
  async sitemapPart({ params, request, response }: HttpContext) {
    const page = Number(/^(\d{1,6})\.xml$/.exec(String(params.file))?.[1] ?? 0)
    const size = seoConfig.sitemapPageSize
    const entries = await feeds.sitemap()
    if (page < 1 || (page - 1) * size >= entries.length) return response.notFound('Bulunamadı')
    this.xml(response, 'application/xml')
    return feeds.urlset(entries.slice((page - 1) * size, page * size), seo.origin(request))
  }

  /** GET /rss.xml: the latest released public chapters. */
  async feed({ request, response }: HttpContext) {
    const items = await feeds.latest()
    this.xml(response, 'application/rss+xml')
    return feeds.rss(
      {
        title: `${site.name} — yeni bölümler`,
        path: '/',
        self: '/rss.xml',
        description: site.description,
      },
      items,
      seo.origin(request)
    )
  }

  /** GET /series/:type/:slug/rss.xml: chapters of one series (none for gated series). */
  async seriesFeed({ params, request, response }: HttpContext) {
    const series = await seriesService.getSeriesBySlug(params.type, params.slug, { people: false })
    if (!series) return response.notFound('Bulunamadı')
    const path = `/series/${series.type}/${series.slug}`
    const items =
      seo.isOpen(series) && series.access === 'public' ? await feeds.latest(series.id) : []
    this.xml(response, 'application/rss+xml')
    return feeds.rss(
      {
        title: `${series.title} — ${site.name}`,
        path,
        self: `${path}/rss.xml`,
        description: series.description || site.description,
      },
      items,
      seo.origin(request)
    )
  }

  private xml(response: HttpContext['response'], type: string) {
    response.header('Content-Type', `${type}; charset=utf-8`)
    response.header('Cache-Control', 'public, max-age=600')
  }
}
