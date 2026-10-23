import edge from 'edge.js'
import site from '#config/site'
import { adminNav } from '#config/admin_nav'
import settings from '#services/settings_service'
import theme from '#services/theme_service'
import cosmetics from '#services/cosmetic_service'
import { levelFor, parseTimestamp } from '#services/level'
import { excerptOf } from '#services/comment_service'
import { buildPaginationPages } from '#services/input_service'
import type User from '#models/user'
import type { Scheme } from '#config/theme'
import { coverView, type CoverSource } from '#services/cover_policy_service'
import { variantSrcset, variantUrl } from '#services/media_service'
import { countOf } from '#services/view_service'
import seo, { type HeadProps, type RequestLike } from '#services/seo_service'
import { reportNoteMax, reportReasons } from '#config/moderation'
import moderation from '#services/moderation_service'

edge.global('site', site)
edge.global('adminNav', adminNav)
/** Accent override CSS and the announcement bar, both set under Admin → Tema. */
edge.global('themeCss', () => theme.css)
edge.global('themeAttrs', () => theme.attrs)
/**
 * Colour scheme of the page (`<html data-theme>`): the visitor's `theme` cookie (written by the
 * scheme switch, plain and unsigned) when Admin → Tema allows it, else the default scheme.
 * Rendered on the server so the first paint never flashes the wrong scheme.
 */
edge.global('schemeOf', (request?: { plainCookie?: (...args: unknown[]) => unknown }) => {
  let choice: unknown = null
  try {
    choice = request?.plainCookie?.('theme', { encoded: false })
  } catch {
    choice = null
  }
  return theme.schemeFor(choice)
})
edge.global('themeMeta', (scheme: Scheme) => theme.themeColorMeta(scheme))
/** Tone of a badge (`data-tone`): content type slug, status/age tone or a semantic tone. */
const semanticTones = ['accent', 'success', 'warning', 'danger', 'info', 'neutral']
edge.global('badgeTone', (kind: string, value: unknown) => {
  const text = String(value ?? '')
  if (kind === 'type') return site.badgeTones.type.includes(text) ? text : 'neutral'
  if (kind === 'status') return site.badgeTones.status[text] ?? 'neutral'
  if (kind === 'age') return site.badgeTones.age[text] ?? 'neutral'
  return semanticTones.includes(kind) ? kind : 'neutral'
})
/** Show/hide switches from Admin → Tema → Göster / Gizle. */
edge.global('ui', (key: string) => theme.flag(key))
/** The admin panel can opt out of the theme, and `?guvenli=1` bypasses it if it became unreadable. */
edge.global(
  'adminThemed',
  (query: Record<string, unknown>) => theme.flag('admin_themed') && !query?.guvenli
)
edge.global('announcement', () => settings.announcement())
/** Equipped frame, name effect and wallpaper of a user (cache warmed by the auth middleware). */
edge.global('lookOf', (user: User | null) => cosmetics.look(user))
edge.global('stickerOf', (id: number | null) => cosmetics.sticker(id))
/** One-line description of a comment (what a reply answers). */
edge.global('excerptOf', excerptOf)
/**
 * Cover fields of a series model as the current visitor may see them (presenter output already
 * has them): `coverOf(review.series).coverImage`, `.coverVeil`.
 */
/**
 * Smaller WebP copies of stored images (media_service, `/content/<path>?w=`):
 * `thumbOf(series.coverImage, 320)` for `src`, `srcsetOf(src, [160, 320, 640])` for `srcset`
 * (empty for images that are not stored rasters, e.g. SVG placeholders: leave srcset out then).
 */
edge.global('thumbOf', variantUrl)
edge.global('srcsetOf', variantSrcset)

edge.global('coverOf', (series: CoverSource) => coverView(series))
/**
 * Search engine and link preview tags of a public page (seo_service; layout/main):
 * `seoHead(request, { title, description, noindex, seo })`, `seo` being what the controller
 * shared. `siteUrl(request, path)` is the absolute address (Tema → Genel → Site adresi, APP_URL
 * or the request) and `shareLinksOf(url, title)` the share targets of partials/share/*.
 */
edge.global('seoHead', (request: RequestLike, props: HeadProps) => seo.head(request, props))
edge.global('siteUrl', (request: RequestLike, path: string) => seo.url(request, path))
edge.global('shareLinksOf', (url: string, title: string) => seo.shareLinks(url, title))
/** "5 dk önce", "3 sa önce", "2 gün önce" for a database timestamp. */
edge.global('agoOf', (value: string) => {
  const seconds = Math.max(0, (Date.now() - parseTimestamp(value)) / 1000)
  if (!Number.isFinite(seconds)) return ''
  if (seconds < 90) return 'az önce'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dk önce`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} sa önce`
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} gün önce`
  return `${Math.floor(seconds / (7 * 86400))} hafta önce`
})
/** Short Turkish view count: "950", "12,4 B", "2,7 Mn" (view_service). */
edge.global('countOf', countOf)
edge.global('levelOf', (user: User | null) => levelFor(user?.exp || 0))
/**
 * Extra attributes forwarded by design-system components (`{{{ attrs(rest.all()) }}}`):
 * Alpine attributes (@click, :class, x-*), aria-*, data-* … Values are HTML escaped, names are
 * restricted (no inline on* handlers), `true` prints a bare attribute and false/null/undefined
 * drop it. Edge's own
 * `$props.toAttrs()` drops unknown names such as @click and does not escape values.
 */
const attributeName = /^[@:a-zA-Z_][\w:.@-]*$/
edge.global('attrs', (values: Record<string, unknown> | null | undefined) => {
  const parts: string[] = []
  for (const [name, value] of Object.entries(values ?? {})) {
    // Inline event handlers (onclick=…) are never forwarded: behaviour belongs in Alpine.
    if (!attributeName.test(name) || /^on/i.test(name)) continue
    if (value === false || value === null || value === undefined) continue
    if (value === true) {
      parts.push(name)
      continue
    }
    const text = String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
    parts.push(`${name}="${text}"`)
  }
  return parts.join(' ')
})
/** "12 Eki 2026" for a database timestamp, in the site's time zone. */
edge.global('dateOf', (value: string, withYear = true) => {
  const time = parseTimestamp(value)
  if (!Number.isFinite(time)) return ''
  return new Date(time).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: site.timezone,
  })
})
/** Page numbers with gaps ('...') for `ui/pagination`. */
edge.global('pagesOf', (current: number, total: number) => buildPaginationPages(current, total))
/**
 * The current URL with some query parameters changed (null/'' removes one, page 1 is dropped),
 * so pagination and filters keep the rest of the query on the server, without JavaScript.
 */
edge.global(
  'withQuery',
  (
    request: { url: () => string; qs: () => Record<string, unknown> },
    changes: Record<string, unknown>
  ) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(request.qs()))
      for (const item of Array.isArray(value) ? value : [value])
        if (item !== undefined && item !== null && typeof item !== 'object')
          params.append(key, String(item))
    for (const [key, value] of Object.entries(changes)) {
      params.delete(key)
      if (value === null || value === undefined || value === '') continue
      if (key === 'page' && Number(value) <= 1) continue
      params.set(key, String(value))
    }
    const query = params.toString()
    return request.url() + (query ? `?${query}` : '')
  }
)
/** Inline style attribute for a cosmetic visual (custom gradients and images). */
edge.global('visualStyle', (visual: { css?: string; img?: string } | null) => {
  if (!visual) return ''
  if (visual.img) return `background-image: url("${encodeURI(visual.img)}")`
  return visual.css || ''
})
/** Reports and moderation: reasons for the report dialog and admin nav counters. */
edge.global('reportConfig', { reasons: reportReasons, noteMax: reportNoteMax })
edge.global('navBadge', (key: string) => moderation.navBadge(key))
