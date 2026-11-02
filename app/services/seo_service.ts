import site from '#config/site'
import seoConfig from '#config/seo'
import settings from '#services/settings_service'
import { coverView, type CoverSource } from '#services/cover_policy_service'
import { variantUrl } from '#services/media_service'
import { pageNumber } from '#services/input_service'
import type { SeriesInfo } from '#services/series_presenter'

/**
 * Search engine and link preview tags of the public pages: canonical address, robots, Open
 * Graph and Twitter Card tags, feed links and JSON-LD (rendered by `seoHead` in layout/main).
 *
 * Absolute addresses use `origin()`: Admin → Tema → Genel → "Site adresi", then `APP_URL`, then
 * the address of the request, so nothing is hard-coded before the domain is settled.
 *
 * Hidden covers (cover_policy_service) are judged as a guest sees them: a blurred or replaced
 * cover never reaches og:image or JSON-LD, the default cover image (or the logo) does instead.
 */

/** What a request offers here (an Adonis `Request`). */
export interface RequestLike {
  protocol(): string
  host(): string | null
  url(): string
  qs(): Record<string, unknown>
}

/** Page details a controller shares as `seo` (`view.share({ seo })`). */
export interface SeoPage {
  /** Site path of the canonical address (default: the current path, see `canonicalPath`). */
  canonical?: string
  noindex?: boolean
  /** og:type (`website` by default). */
  type?: string
  /** Site path or absolute address of a raster image; null for none. */
  image?: string | null
  imageAlt?: string
  /** An extra RSS feed of the page (a series feed). */
  feed?: { title: string; path: string } | null
  /** JSON-LD documents; `url` makes a site path absolute. */
  jsonLd?: (url: (path: string) => string) => Record<string, unknown>[]
}

export interface HeadProps {
  title?: string | null
  description?: string | null
  noindex?: boolean
  seo?: SeoPage | null
}

const rasterImage = /\.(jpe?g|png|webp|gif)$/i
const absoluteUrl = /^https?:\/\//i

/** Text for HTML attributes and XML (`&`, `<`, `>`, quotes). */
export function escapeXml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/** JSON for `<script type="application/ld+json">`: `</script>`, `<!--` and `&` cannot break out. */
export function scriptJson(data: unknown) {
  return JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029')
}

/** One line of text, cut at a word boundary with an ellipsis. */
export function clip(text: string | null | undefined, length = seoConfig.descriptionLength) {
  const line = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (line.length <= length) return line
  const cut = line.slice(0, length - 1)
  const space = cut.lastIndexOf(' ')
  return (space > length * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '') + '…'
}

/** Schema.org type of a series by its content format. */
const schemaTypes = { image: 'ComicSeries', text: 'Book', video: 'TVSeries' } as const

class SeoService {
  /** `https://example.com` (no trailing slash). */
  origin(request?: Pick<RequestLike, 'protocol' | 'host'> | null) {
    const configured = (settings.get('site_url') || seoConfig.appUrl).replace(/\/+$/, '')
    if (configured) return configured
    const host = request?.host()
    return host ? `${request!.protocol()}://${host}` : ''
  }

  /** A site path as an absolute address (absolute addresses are kept). */
  absolute(path: string, origin: string) {
    if (absoluteUrl.test(path)) return path
    return origin + (path.startsWith('/') ? path : `/${path}`)
  }

  url(request: Pick<RequestLike, 'protocol' | 'host'> | null, path: string) {
    return this.absolute(path, this.origin(request))
  }

  /** Account pages, the admin panel and JSON endpoints (config/seo.ts → privatePaths). */
  isPrivate(path: string) {
    return seoConfig.privatePaths.some((item) => path === item || path.startsWith(`${item}/`))
  }

  /** Catalog search results (`/seriler?search=`) are not indexed. */
  isSearch(request: RequestLike) {
    const search = request.qs().search
    return request.url() === '/seriler' && typeof search === 'string' && search.trim() !== ''
  }

  /**
   * The current path without its query, except `?page=N` on the home page and the catalog when
   * nothing else narrows the list (filters canonicalise to the plain catalog).
   */
  canonicalPath(request: RequestLike) {
    const path = request.url()
    if (path !== '/' && path !== '/seriler') return path
    const qs = request.qs()
    const narrowed = Object.keys(qs).some(
      (key) => key !== 'page' && !seoConfig.trackingParams.test(key) && qs[key] !== ''
    )
    const page = pageNumber(qs.page)
    return !narrowed && page > 1 ? `${path}?page=${page}` : path
  }

  /** A raster image fit for link previews (1280 px WebP copy of stored files), or null. */
  previewImage(path: string | null | undefined) {
    if (!path || !(path.startsWith('/') || absoluteUrl.test(path))) return null
    if (!rasterImage.test(path.split('?')[0])) return null
    return variantUrl(path, 1280)
  }

  /** Logo when it is a raster image: the preview of pages without their own image. */
  fallbackImage() {
    return this.previewImage(site.logo)
  }

  /**
   * Preview image of a series as a guest sees it: the cover (else the banner) when it is shown,
   * the default cover image (Admin → Tema → Yaş ve Erişim) or the logo when it is hidden.
   */
  seriesImage(series: CoverSource) {
    const view = coverView(series, { age: 0, member: false })
    if (view.coverVeil)
      return this.previewImage(settings.get('cover_placeholder_url')) ?? this.fallbackImage()
    return (
      this.previewImage(view.coverImage) ??
      this.previewImage(view.bannerImage) ??
      this.fallbackImage()
    )
  }

  /** True when a series page opens for everyone without an age gate (sitemap, feeds). */
  isOpen(series: Pick<SeriesInfo, 'draft' | 'ageRating'>) {
    return !series.draft && settings.agePolicy(series.ageRating) === 'none'
  }

  /** Breadcrumbs: Ana Sayfa → Seriler → series (→ chapter). */
  private breadcrumbs(url: (path: string) => string, items: { name: string; path: string }[]) {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': [
        { name: 'Ana Sayfa', path: '/' },
        { name: 'Seriler', path: '/seriler' },
      ]
        .concat(items)
        .map((item, index) => ({
          '@type': 'ListItem',
          'position': index + 1,
          'name': item.name,
          'item': url(item.path),
        })),
    }
  }

  /** Series page (also its age gate, which is not indexed). */
  seriesPage(series: SeriesInfo, { gated = false } = {}): SeoPage {
    const path = `/series/${series.type}/${series.slug}`
    const image = this.seriesImage(series)
    const open = this.isOpen(series) && series.access === 'public'
    return {
      canonical: path,
      noindex: gated || series.draft,
      type:
        series.format === 'video' ? 'video.tv_show' : series.format === 'text' ? 'book' : 'website',
      image,
      imageAlt: `${series.title} kapak görseli`,
      feed: open ? { title: `${series.title} — yeni bölümler`, path: `${path}/rss.xml` } : null,
      jsonLd: (url) => [
        {
          '@context': 'https://schema.org',
          '@type': schemaTypes[series.format] ?? 'CreativeWorkSeries',
          'name': series.title,
          ...(series.alternativeTitles.length ? { alternateName: series.alternativeTitles } : {}),
          'url': url(path),
          ...(series.description ? { description: clip(series.description, 500) } : {}),
          'inLanguage': site.language,
          ...(image ? { image: url(image) } : {}),
          ...(series.authors.length
            ? {
                author: series.authors.map((person) => ({
                  '@type': 'Person',
                  'name': person.name,
                })),
              }
            : {}),
          ...(series.genres.length ? { genre: series.genres } : {}),
          ...(series.publicationYear ? { datePublished: String(series.publicationYear) } : {}),
          ...(series.ageRating ? { contentRating: series.ageRating } : {}),
          ...(series.ratingCount >= 1
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  'ratingValue': Math.round(series.ratingAverage * 10) / 10,
                  'ratingCount': series.ratingCount,
                  'bestRating': 10,
                  'worstRating': 1,
                },
              }
            : {}),
        },
        this.breadcrumbs(url, [{ name: series.title, path }]),
      ],
    }
  }

  /** Reader / player page of a chapter (also its gates, which are not indexed). */
  chapterPage(
    series: SeriesInfo,
    chapter: { number: number; title: string | null; draft?: boolean },
    { gated = false } = {}
  ): SeoPage {
    const seriesPath = `/series/${series.type}/${series.slug}`
    const path = `${seriesPath}/${chapter.number}`
    const open = this.isOpen(series) && series.access === 'public'
    return {
      canonical: path,
      noindex: gated || series.draft || Boolean(chapter.draft),
      type: series.format === 'video' ? 'video.episode' : 'article',
      image: this.seriesImage(series),
      imageAlt: `${series.title} kapak görseli`,
      feed: open
        ? { title: `${series.title} — yeni bölümler`, path: `${seriesPath}/rss.xml` }
        : null,
      jsonLd: (url) => [
        this.breadcrumbs(url, [
          { name: series.title, path: seriesPath },
          { name: `Bölüm ${chapter.number}`, path },
        ]),
      ],
    }
  }

  /** WebSite with the catalog search (home page). */
  private website(url: (path: string) => string) {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      'name': site.name,
      'url': url('/'),
      'inLanguage': site.language,
      ...(site.description ? { description: site.description } : {}),
      'potentialAction': {
        '@type': 'SearchAction',
        'target': {
          '@type': 'EntryPoint',
          'urlTemplate': `${url('/seriler')}?search={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    }
  }

  /** The tags of one page as HTML (every value escaped). */
  head(request: RequestLike, { title, description, noindex = false, seo }: HeadProps = {}) {
    const origin = this.origin(request)
    const url = (path: string) => this.absolute(path, origin)
    const path = request.url()
    const hidden =
      noindex || Boolean(seo?.noindex) || this.isPrivate(path) || this.isSearch(request)
    const pageUrl = url(seo?.canonical ?? this.canonicalPath(request))
    const name = title && title !== site.name ? title : site.name
    const summary = clip(description ?? site.description)
    const image = seo?.image === undefined ? this.fallbackImage() : seo.image

    const tags: string[] = []
    const meta = (attribute: 'name' | 'property', key: string, value: unknown) =>
      tags.push(`<meta ${attribute}="${key}" content="${escapeXml(value)}">`)
    if (hidden) meta('name', 'robots', 'noindex, follow')
    else tags.push(`<link rel="canonical" href="${escapeXml(pageUrl)}">`)
    meta('property', 'og:type', seo?.type || 'website')
    meta('property', 'og:site_name', site.name)
    meta('property', 'og:locale', seoConfig.locale)
    meta('property', 'og:title', name)
    if (summary) meta('property', 'og:description', summary)
    meta('property', 'og:url', pageUrl)
    if (image) {
      meta('property', 'og:image', url(image))
      meta('property', 'og:image:alt', seo?.imageAlt || name)
    }
    meta('name', 'twitter:card', image ? 'summary_large_image' : 'summary')
    meta('name', 'twitter:title', name)
    if (summary) meta('name', 'twitter:description', summary)
    if (image) meta('name', 'twitter:image', url(image))

    const feeds = [{ title: `${site.name} — yeni bölümler`, path: '/rss.xml' }]
    if (seo?.feed) feeds.push(seo.feed)
    for (const feed of feeds)
      tags.push(
        `<link rel="alternate" type="application/rss+xml" title="${escapeXml(feed.title)}" href="${escapeXml(url(feed.path))}">`
      )

    if (!hidden) {
      const documents = [
        ...(path === '/' ? [this.website(url)] : []),
        ...(seo?.jsonLd?.(url) ?? []),
      ]
      for (const document of documents)
        tags.push(`<script type="application/ld+json">${scriptJson(document)}</script>`)
    }
    return tags.join('\n  ')
  }

  /** Share targets of a page (partials/share/*); no third-party scripts, plain links. */
  shareLinks(url: string, title: string) {
    const link = encodeURIComponent(url)
    const text = encodeURIComponent(title)
    return [
      {
        key: 'whatsapp',
        label: 'WhatsApp',
        href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
      },
      {
        key: 'telegram',
        label: 'Telegram',
        href: `https://t.me/share/url?url=${link}&text=${text}`,
      },
      { key: 'x', label: 'X', href: `https://x.com/intent/tweet?url=${link}&text=${text}` },
      {
        key: 'facebook',
        label: 'Facebook',
        href: `https://www.facebook.com/sharer/sharer.php?u=${link}`,
      },
    ]
  }
}

export default new SeoService()
