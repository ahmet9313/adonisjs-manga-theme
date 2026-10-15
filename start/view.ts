import edge from 'edge.js'
import site from '#config/site'
import { adminNav } from '#config/admin_nav'
import settings from '#services/settings_service'
import theme from '#services/theme_service'
import cosmetics from '#services/cosmetic_service'
import { levelFor, parseTimestamp } from '#services/level'
import { excerptOf } from '#services/comment_service'
import type User from '#models/user'

edge.global('site', site)
edge.global('adminNav', adminNav)
/** Accent override CSS and the announcement bar, both set under Admin → Tema. */
edge.global('themeCss', () => theme.css)
edge.global('themeAttrs', () => theme.attrs)
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
edge.global('levelOf', (user: User | null) => levelFor(user?.exp || 0))
/** Inline style attribute for a cosmetic visual (custom gradients and images). */
edge.global('visualStyle', (visual: { css?: string; img?: string } | null) => {
  if (!visual) return ''
  if (visual.img) return `background-image: url("${encodeURI(visual.img)}")`
  return visual.css || ''
})
