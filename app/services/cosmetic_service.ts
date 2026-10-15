import db from '@adonisjs/lucid/services/db'
import Cosmetic from '#models/cosmetic'
import type User from '#models/user'
import { badges } from '#config/rewards'
import { cosmeticKinds, gradientPattern, type CosmeticKind } from '#config/cosmetics'
import { now } from '#services/input_service'

/** How a cosmetic is drawn: a CSS class, inline custom properties or an image. */
export interface Visual {
  cls?: string
  css?: string
  img?: string
}

export interface Look {
  frame: Visual | null
  effect: Visual | null
  wallpaper: Visual | null
}

type Wearer = Pick<User, 'frameId' | 'effectId' | 'wallpaperId'>
type Equippable = Exclude<CosmeticKind, 'sticker'>

export const equipColumn: Record<Equippable, 'frameId' | 'effectId' | 'wallpaperId'> = {
  frame: 'frameId',
  effect: 'effectId',
  wallpaper: 'wallpaperId',
}
const equipDbColumn: Record<Equippable, string> = {
  frame: 'frame_id',
  effect: 'effect_id',
  wallpaper: 'wallpaper_id',
}

export interface OwnerState {
  level: number
  badges: Set<string>
  gifts: Set<number>
}

const badgeNames = new Map(badges.map((badge) => [badge.slug, badge.name]))

/**
 * Earned cosmetics. The catalog is small and read on every page that shows a user, so it is
 * cached in memory and invalidated by the admin panel.
 */
class CosmeticService {
  private cache: Map<number, Cosmetic> | null = null
  private loading: Promise<Map<number, Cosmetic>> | null = null

  async catalog() {
    if (this.cache) return this.cache
    this.loading ??= Cosmetic.query()
      .orderBy('sortOrder', 'asc')
      .orderBy('id', 'asc')
      .then((rows) => {
        this.cache = new Map(rows.map((row) => [row.id, row]))
        this.loading = null
        return this.cache
      })
    return this.loading
  }

  async ready() {
    await this.catalog()
  }

  invalidate() {
    this.cache = null
    this.loading = null
  }

  visual(cosmetic: Cosmetic): Visual {
    if (cosmetic.image) return { img: cosmetic.image }
    const style = cosmetic.style || ''
    if (cosmetic.kind === 'effect' && gradientPattern.test(style)) {
      const colors = style.slice(5).split(',')
      return { cls: 'fx fx-custom', css: `--fx: linear-gradient(90deg, ${colors.join(', ')})` }
    }
    const prefix = { effect: 'fx fx-', frame: 'frame-', wallpaper: 'wall-', sticker: '' }[
      cosmetic.kind
    ]
    return style ? { cls: prefix + style } : {}
  }

  private active(id: number | null, kind: CosmeticKind) {
    if (!id || !this.cache) return null
    const cosmetic = this.cache.get(id)
    return cosmetic && cosmetic.active && cosmetic.kind === kind ? this.visual(cosmetic) : null
  }

  /** Synchronous after `ready()`; the auth middleware warms the cache on every request. */
  look(user: Wearer | null | undefined): Look {
    if (!user) return { frame: null, effect: null, wallpaper: null }
    return {
      frame: this.active(user.frameId, 'frame'),
      effect: this.active(user.effectId, 'effect'),
      wallpaper: this.active(user.wallpaperId, 'wallpaper'),
    }
  }

  sticker(id: number | null) {
    if (!id || !this.cache) return null
    const cosmetic = this.cache.get(id)
    return cosmetic && cosmetic.kind === 'sticker' && cosmetic.image
      ? { id: cosmetic.id, name: cosmetic.name, image: cosmetic.image }
      : null
  }

  lockText(cosmetic: Cosmetic) {
    if (cosmetic.grantOnly) return 'Yalnızca hediye'
    if (cosmetic.requiredBadge)
      return `Rozet: ${badgeNames.get(cosmetic.requiredBadge) ?? cosmetic.requiredBadge}`
    return `Seviye ${cosmetic.requiredLevel}`
  }

  async ownerState(user: User): Promise<OwnerState> {
    const [earned, gifts] = await Promise.all([
      db.from('user_badges').where('user_id', user.id).select('badge'),
      db.from('user_cosmetics').where('user_id', user.id).select('cosmetic_id'),
    ])
    return {
      level: user.level,
      badges: new Set(earned.map((row) => row.badge)),
      gifts: new Set(gifts.map((row) => Number(row.cosmetic_id))),
    }
  }

  isUnlocked(cosmetic: Cosmetic, state: OwnerState | null) {
    if (!state) return false
    if (state.gifts.has(cosmetic.id)) return true
    if (cosmetic.grantOnly) return false
    if (cosmetic.requiredBadge) return state.badges.has(cosmetic.requiredBadge)
    return state.level >= cosmetic.requiredLevel
  }

  private async usage(kind: CosmeticKind) {
    const rows =
      kind === 'sticker'
        ? await db
            .from('comments')
            .whereNotNull('sticker_id')
            .select('sticker_id as id')
            .count('* as total')
            .groupBy('sticker_id')
        : await db
            .from('users')
            .whereNotNull(equipDbColumn[kind])
            .select(`${equipDbColumn[kind]} as id`)
            .count('* as total')
            .groupBy(equipDbColumn[kind])
    return new Map(rows.map((row) => [Number(row.id), Number(row.total)]))
  }

  /** Collection page: every active item of a kind with its lock state for the viewer. */
  async store(kind: CosmeticKind, user: User | null) {
    const [catalog, usage, state] = await Promise.all([
      this.catalog(),
      this.usage(kind),
      user ? this.ownerState(user) : null,
    ])
    const equipped = user && kind !== 'sticker' ? user[equipColumn[kind]] : null
    return [...catalog.values()]
      .filter((item) => item.kind === kind && item.active)
      .map((item) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        visual: this.visual(item),
        featured: item.featured,
        unlocked: this.isUnlocked(item, state),
        lockText: this.lockText(item),
        requiredLevel: item.grantOnly || item.requiredBadge ? null : item.requiredLevel,
        users: usage.get(item.id) ?? 0,
        equipped: equipped === item.id,
        order: item.sortOrder,
      }))
  }

  async inventory(user: User) {
    const [catalog, state] = await Promise.all([this.catalog(), this.ownerState(user)])
    const result: Record<
      CosmeticKind,
      { id: number; name: string; visual: Visual; equipped: boolean }[]
    > = { sticker: [], frame: [], effect: [], wallpaper: [] }
    for (const item of catalog.values()) {
      if (!item.active || !this.isUnlocked(item, state)) continue
      result[item.kind].push({
        id: item.id,
        name: item.name,
        visual: this.visual(item),
        equipped: item.kind !== 'sticker' && user[equipColumn[item.kind]] === item.id,
      })
    }
    return result
  }

  async equip(user: User, id: number) {
    const catalog = await this.catalog()
    const item = catalog.get(id)
    if (!item || !item.active || !cosmeticKinds[item.kind].equip)
      return { error: 'Öğe bulunamadı.' }
    if (!this.isUnlocked(item, await this.ownerState(user)))
      return { error: `Bu öğe kilitli (${this.lockText(item)}).` }
    const kind = item.kind as Equippable
    user[equipColumn[kind]] = item.id
    user.updatedAt = now()
    await user.save()
    return { kind, look: this.look(user) }
  }

  async unequip(user: User, kind: Equippable) {
    user[equipColumn[kind]] = null
    user.updatedAt = now()
    await user.save()
    return { kind, look: this.look(user) }
  }

  async usableSticker(user: User, id: number) {
    const catalog = await this.catalog()
    const item = catalog.get(id)
    if (!item || !item.active || item.kind !== 'sticker') return null
    return this.isUnlocked(item, await this.ownerState(user)) ? item : null
  }

  async grant(userId: number, cosmeticId: number) {
    const exists = await db
      .from('user_cosmetics')
      .where({ user_id: userId, cosmetic_id: cosmeticId })
      .first()
    if (exists) return false
    await db
      .table('user_cosmetics')
      .insert({ user_id: userId, cosmetic_id: cosmeticId, created_at: now() })
    return true
  }

  /** Items opened by reaching a level in (from, to]; used for level-up messages. */
  async unlockedBetween(from: number, to: number) {
    const catalog = await this.catalog()
    return [...catalog.values()].filter(
      (item) =>
        item.active &&
        !item.grantOnly &&
        !item.requiredBadge &&
        item.requiredLevel > from &&
        item.requiredLevel <= to
    )
  }

  async unlockedByBadge(slug: string) {
    const catalog = await this.catalog()
    return [...catalog.values()].filter((item) => item.active && item.requiredBadge === slug)
  }

  /** Clears equipped references before a cosmetic is deleted. */
  async detach(cosmetic: Cosmetic) {
    if (cosmetic.kind === 'sticker')
      await db.from('comments').where('sticker_id', cosmetic.id).update({ sticker_id: null })
    else
      await db
        .from('users')
        .where(equipDbColumn[cosmetic.kind as Equippable], cosmetic.id)
        .update({ [equipDbColumn[cosmetic.kind as Equippable]]: null })
  }
}

export default new CosmeticService()
