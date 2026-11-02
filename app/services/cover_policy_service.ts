import { HttpContext } from '@adonisjs/core/http'
import site, { type CoverMode, type CoverReveal, type SeriesCoverMode } from '#config/site'
import settings from '#services/settings_service'
import access, { AGE_COOKIE, ageOf } from '#services/access_service'

/**
 * Hidden covers, as manga sites do for adult series: the cover of a series is shown, blurred
 * or replaced by a default image depending on its age rating (Admin → Tema → Yaş ve Erişim,
 * `cover_policy_18` …) or its own setting (`series.cover_mode`).
 *
 * `cover_reveal` decides who sees the real cover anyway: nobody, visitors who confirmed their age
 * at the age gate (AGE_COOKIE ≥ the rating), signed-in members, or members who confirmed their
 * age. Staff count as members but are not treated otherwise, so the setting can be checked from
 * the site; the admin panel always shows the real images.
 */

export interface CoverSource {
  /** Stored value; anything but a site path becomes the no-cover image. */
  coverImage: string | null
  bannerImage?: string | null
  ageRating: string | null
  coverMode?: SeriesCoverMode | null
}

export interface CoverView {
  coverImage: string
  bannerImage: string | null
  /** `blur`: show coverImage blurred; `placeholder`: coverImage is the default image. */
  coverVeil: Exclude<CoverMode, 'show'> | null
}

/** The rule that applies to a series before the visitor is considered. */
export function coverModeOf(series: Pick<CoverSource, 'ageRating' | 'coverMode'>): CoverMode {
  const own = series.coverMode || 'auto'
  return own === 'auto' ? settings.coverPolicy(series.ageRating) : own
}

export interface CoverViewer {
  /** Highest age the visitor confirmed at the age gate. */
  age: number
  member: boolean
}

/** The current visitor (a guest without confirmation outside a request). */
export function currentViewer(): CoverViewer {
  const ctx = HttpContext.get()
  if (!ctx) return { age: 0, member: false }
  return {
    age: access.confirmedAge(ctx.request.plainCookie(AGE_COOKIE, { encoded: false })),
    member: Boolean(ctx.auth?.user),
  }
}

function revealed(rating: string | null, viewer: CoverViewer) {
  const age = ageOf(rating)
  const confirmed = age > 0 && viewer.age >= age
  switch (settings.get('cover_reveal') as CoverReveal) {
    case 'age':
      return confirmed
    case 'members':
      return viewer.member
    case 'members_age':
      return viewer.member && confirmed
    default:
      return false
  }
}

export function placeholderCover() {
  return settings.get('cover_placeholder_url') || site.hiddenCover
}

/** The visitor is only looked up (request context, age cookie) when the cover is hidden. */
export function coverView(series: CoverSource, viewer?: CoverViewer): CoverView {
  const coverImage = series.coverImage?.startsWith('/') ? series.coverImage : '/images/no-cover.svg'
  const bannerImage = series.bannerImage ?? null
  const mode = coverModeOf(series)
  if (mode === 'show' || revealed(series.ageRating, viewer ?? currentViewer()))
    return { coverImage, bannerImage, coverVeil: null }
  if (mode === 'blur') return { coverImage, bannerImage, coverVeil: 'blur' }
  return { coverImage: placeholderCover(), bannerImage: null, coverVeil: 'placeholder' }
}
