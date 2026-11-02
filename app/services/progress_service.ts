import db from '@adonisjs/lucid/services/db'
import type User from '#models/user'
import cosmetics from '#services/cosmetic_service'
import cards from '#services/card_service'
import notifications from '#services/notification_service'
import { now } from '#services/input_service'
import { levelFor, localDay, previousDay } from '#services/level'
import { recordAttempt, tooManyAttempts } from '#services/throttle'
import { badges, cardDrops, exp, type Metric } from '#config/rewards'

type Random = () => number

/** Minimum gap between two rewarded chapter reads (stops page-flipping farms). */
const readRewardGap = 20 * 1000

/** EXP, levels, the daily check-in and badges. */
class ProgressService {
  /** Adds EXP and announces level-ups together with the cosmetics they open. */
  async addExp(user: User, amount: number) {
    if (amount <= 0) return { level: user.level, levelUp: false }
    const before = user.level
    await db.from('users').where('id', user.id).increment('exp', amount)
    const row = await db.from('users').where('id', user.id).select('exp').first()
    user.exp = Number(row.exp)
    user.$original.exp = user.exp
    const after = user.level
    if (after > before) {
      const opened = await cosmetics.unlockedBetween(before, after)
      await notifications.notify(user.id, 'reward', {
        title: `Seviye atladın: Lv.${after}`,
        body: opened.length
          ? `Yeni açılanlar: ${opened.map((item) => item.name).join(', ')}.`
          : 'Okumaya ve yorum yapmaya devam ettikçe yeni kozmetikler açılır.',
        link: '/oduller',
      })
    }
    return { level: after, levelUp: after > before }
  }

  private async metrics(user: User, wanted: Set<Metric>) {
    const count = async (table: string, extra?: (query: any) => void) => {
      const query = db.from(table).where('user_id', user.id)
      extra?.(query)
      const [row] = await query.count('* as total')
      return Number(row.total)
    }
    const values: Partial<Record<Metric, number>> = {}
    // Chapters marked read by hand (reading_list_service) do not count towards badges.
    if (wanted.has('chapters'))
      values.chapters = await count('chapter_reads', (query) => query.where('marked', false))
    if (wanted.has('comments'))
      values.comments = await count('comments', (query) => query.whereNull('deleted_at'))
    if (wanted.has('likesReceived')) {
      const [row] = await db.from('comments').where('user_id', user.id).sum('like_count as total')
      values.likesReceived = Number(row.total || 0)
    }
    if (wanted.has('cards')) values.cards = await count('user_cards')
    if (wanted.has('reviews'))
      values.reviews = await count('series_reviews', (query) =>
        query.whereNotNull('body').whereNot('body', '')
      )
    if (wanted.has('helpfulReceived')) {
      const [row] = await db
        .from('series_reviews')
        .where('user_id', user.id)
        .sum('helpful_count as total')
      values.helpfulReceived = Number(row.total || 0)
    }
    values.streak = Math.max(user.bestStreak || 0, user.streak || 0)
    values.level = user.level
    values.profileLikes = user.profileLikeCount || 0
    return values
  }

  async earnedBadges(userId: number) {
    const rows = await db.from('user_badges').where('user_id', userId).select('badge', 'earned_at')
    return new Map(rows.map((row) => [row.badge as string, row.earned_at as string]))
  }

  /** Grants every badge whose goal is met; repeats once because badge EXP can raise the level. */
  async evaluate(user: User) {
    const granted: string[] = []
    for (let pass = 0; pass < 2; pass++) {
      const earned = await this.earnedBadges(user.id)
      const open = badges.filter((badge) => !earned.has(badge.slug))
      if (!open.length) break
      const values = await this.metrics(user, new Set(open.map((badge) => badge.metric)))
      const reached = open.filter((badge) => (values[badge.metric] ?? 0) >= badge.goal)
      if (!reached.length) break
      for (const badge of reached) {
        try {
          await db
            .table('user_badges')
            .insert({ user_id: user.id, badge: badge.slug, earned_at: now() })
        } catch {
          continue // a parallel request granted it first
        }
        granted.push(badge.slug)
        const opened = await cosmetics.unlockedByBadge(badge.slug)
        await notifications.notify(user.id, 'reward', {
          title: `Rozet kazandın: ${badge.icon} ${badge.name}`,
          body:
            badge.description +
            (badge.exp ? ` +${badge.exp} EXP.` : '') +
            (opened.length ? ` Açılanlar: ${opened.map((item) => item.name).join(', ')}.` : ''),
          link: '/rozetler',
        })
        await this.addExp(user, badge.exp)
      }
    }
    return granted
  }

  /** Called for every chapter view of a signed-in reader. */
  async chapterRead(user: User, seriesId: number, isNew: boolean, random: Random = Math.random) {
    if (!isNew) return null
    const key = `read-reward:${user.id}`
    if (tooManyAttempts(key, 1)) return null
    recordAttempt(key, readRewardGap)
    await this.addExp(user, exp.chapterRead)
    const card =
      random() < cardDrops.readChance ? await cards.drop(user.id, seriesId, random) : null
    await this.evaluate(user)
    return { exp: exp.chapterRead, card }
  }

  async commented(user: User) {
    await this.addExp(user, exp.comment)
    await this.evaluate(user)
  }

  /** `firstTime` is false when an existing rating is edited. */
  async reviewed(user: User, firstTime: boolean) {
    if (firstTime) await this.addExp(user, exp.review)
    await this.evaluate(user)
  }

  checkinReward(streak: number) {
    return exp.checkinBase + exp.checkinStreakBonus * Math.min(streak - 1, exp.checkinStreakCap - 1)
  }

  async checkin(user: User, random: Random = Math.random) {
    const today = localDay()
    if (user.lastCheckinOn === today) return { already: true as const }
    const streak = user.lastCheckinOn === previousDay(today) ? (user.streak || 0) + 1 : 1
    const changed = await db
      .from('users')
      .where('id', user.id)
      .where((query) => query.whereNull('last_checkin_on').orWhereNot('last_checkin_on', today))
      .update({
        last_checkin_on: today,
        streak,
        best_streak: Math.max(user.bestStreak || 0, streak),
        updated_at: now(),
      })
    if (!Number(changed)) return { already: true as const }
    user.lastCheckinOn = today
    user.streak = streak
    user.bestStreak = Math.max(user.bestStreak || 0, streak)
    for (const field of ['lastCheckinOn', 'streak', 'bestStreak'] as const)
      (user.$original as Record<string, unknown>)[field] = user[field]
    const gained = this.checkinReward(streak)
    const { levelUp } = await this.addExp(user, gained)
    const card =
      streak % cardDrops.checkinEvery === 0 ? await cards.drop(user.id, null, random) : null
    await this.evaluate(user)
    return {
      already: false as const,
      gained,
      streak,
      levelUp,
      card: card ? { name: card.name, rarity: card.rarity } : null,
      ...levelFor(user.exp),
    }
  }

  async welcome(user: User) {
    await notifications.notify(user.id, 'system', {
      title: 'Topluluğa hoş geldin!',
      body: `Kayıt olduğun için +${exp.signup} EXP kazandın. Okudukça, yorum yaptıkça ve her gün giriş yaptıkça seviye atlayıp yeni çerçeve, efekt ve çıkartmalar açabilirsin.`,
      link: '/oduller',
    })
    await this.addExp(user, exp.signup)
  }

  /** Data for the account menu, rendered on every HTML page for signed-in readers. */
  async summary(user: User) {
    const [unread, cardCount, badgeRow] = await Promise.all([
      notifications.unreadCount(user.id),
      cards.ownedCount(user.id),
      db.from('user_badges').where('user_id', user.id).count('* as total'),
    ])
    const today = localDay()
    const alive = user.lastCheckinOn === today || user.lastCheckinOn === previousDay(today)
    return {
      ...levelFor(user.exp || 0),
      streak: alive ? user.streak || 0 : 0,
      checkedIn: user.lastCheckinOn === today,
      nextCheckin: this.checkinReward(
        alive && user.lastCheckinOn !== today ? (user.streak || 0) + 1 : 1
      ),
      unread,
      cards: cardCount,
      badges: Number(badgeRow[0].total),
      look: cosmetics.look(user),
    }
  }

  async badgeBoard(user: User) {
    const earned = await this.earnedBadges(user.id)
    const values = await this.metrics(user, new Set(badges.map((badge) => badge.metric)))
    return badges.map((badge) => ({
      ...badge,
      earnedAt: earned.get(badge.slug) ?? null,
      value: Math.min(values[badge.metric] ?? 0, badge.goal),
    }))
  }
}

export default new ProgressService()
