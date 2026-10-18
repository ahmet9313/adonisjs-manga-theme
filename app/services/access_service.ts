import type User from '#models/user'
import type { AccessLevel } from '#config/site'
import settings from '#services/settings_service'

/** Cookie holding the highest age rating the visitor confirmed (e.g. "18"); a year long. */
export const AGE_COOKIE = 'age_ok'
export const AGE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60

const accessRank: Record<AccessLevel, number> = { public: 0, members: 1, vip: 2 }

/** 0 guest, 1 member, 2 VIP, 3 staff (administrators and editors open everything). */
function viewerRank(user: User | null | undefined) {
  if (!user) return 0
  if (user.isStaff) return 3
  return user.role === 'vip' ? 2 : 1
}

/** Numeric part of an age rating ("18+" → 18), 0 when there is none. */
export const ageOf = (rating: string | null | undefined) => Number.parseInt(rating || '', 10) || 0

/**
 * Why a visitor cannot open a series or chapter yet, in the order they are asked:
 * - `login`: the age policy requires an account, or the content is for members / VIP members;
 * - `vip`: a signed-in member opening VIP content;
 * - `age`: the age rating asks for a confirmation the visitor has not given;
 * - `warning`: the chapter's own notice was not confirmed yet (`?onay=1`).
 */
export type Gate =
  | { kind: 'login'; reason: 'age' | 'members' | 'vip' }
  | { kind: 'vip' }
  | { kind: 'age'; age: number }
  | { kind: 'warning'; text: string }

interface Target {
  series: { draft: boolean; access: AccessLevel; ageRating: string | null }
  chapter?: { draft?: boolean; access?: AccessLevel; warning?: string | null } | null
}

class AccessService {
  canSeeDrafts(user: User | null | undefined) {
    return Boolean(user?.isStaff)
  }

  /** The stricter of the series' and the chapter's access. */
  effectiveAccess({ series, chapter }: Target): AccessLevel {
    const own = chapter?.access ?? 'public'
    return accessRank[own] > accessRank[series.access] ? own : series.access
  }

  /** True when the visitor may open content with this access level. */
  allows(user: User | null | undefined, access: AccessLevel) {
    return viewerRank(user) >= accessRank[access]
  }

  /** False for drafts the visitor may not know about (answer 404). */
  visible(user: User | null | undefined, { series, chapter }: Target) {
    return this.canSeeDrafts(user) || (!series.draft && !chapter?.draft)
  }

  /**
   * The first gate between the visitor and the page, or null. `confirmedAge` comes from the
   * AGE_COOKIE; `warningConfirmed` is the chapter notice's `?onay=1`. Staff skip the access and
   * age gates but still see a chapter notice, so they can check how it reads.
   */
  gate(
    user: User | null | undefined,
    target: Target,
    { confirmedAge = 0, warningConfirmed = false } = {}
  ): Gate | null {
    const staff = Boolean(user?.isStaff)
    const policy = settings.agePolicy(target.series.ageRating)
    const age = ageOf(target.series.ageRating)
    if (!staff) {
      if (policy === 'members' && !user) return { kind: 'login', reason: 'age' }
      const access = this.effectiveAccess(target)
      if (!this.allows(user, access)) {
        if (!user) return { kind: 'login', reason: access === 'vip' ? 'vip' : 'members' }
        return { kind: 'vip' }
      }
      if (policy !== 'none' && confirmedAge < age) return { kind: 'age', age }
    }
    const warning = target.chapter?.warning?.trim()
    if (warning && !warningConfirmed) return { kind: 'warning', text: warning }
    return null
  }

  /** Confirmed age from the request cookie (a plain number; anything else counts as none). */
  confirmedAge(raw: unknown) {
    const value = Number(raw)
    return Number.isInteger(value) && value > 0 && value <= 99 ? value : 0
  }
}

export default new AccessService()
