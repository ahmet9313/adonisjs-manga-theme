import db from '@adonisjs/lucid/services/db'
import Card from '#models/card'
import SeriesModel from '#models/series'
import notifications from '#services/notification_service'
import { now } from '#services/input_service'
import { rarities, rarityRules, type Rarity } from '#config/rewards'

type Random = () => number

function pickRarity(available: Set<Rarity>, random: Random): Rarity | null {
  const options = rarities.filter((rarity) => available.has(rarity))
  const total = options.reduce((sum, rarity) => sum + rarityRules[rarity].weight, 0)
  let roll = random() * total
  for (const rarity of options) {
    roll -= rarityRules[rarity].weight
    if (roll < 0) return rarity
  }
  return options.at(-1) ?? null
}

/** Collectible character cards: earned by reading/check-ins, duplicates become shards. */
class CardService {
  async give(userId: number, card: Card, notify = true) {
    await db.transaction(async (trx) => {
      const existing = await trx
        .from('user_cards')
        .where({ user_id: userId, card_id: card.id })
        .first()
      if (existing) await trx.from('user_cards').where('id', existing.id).increment('count', 1)
      else
        await trx
          .table('user_cards')
          .insert({ user_id: userId, card_id: card.id, count: 1, obtained_at: now() })
    })
    if (notify)
      await notifications.notify(userId, 'reward', {
        title: `Yeni kart: ${card.name} (${card.rarity})`,
        body: `${rarityRules[card.rarity].label} nadirlikte bir kart koleksiyonuna eklendi.`,
        link: '/kartlar',
      })
    return card
  }

  /** Random weighted drop; cards of the series being read are preferred half of the time. */
  async drop(userId: number, seriesId: number | null, random: Random = Math.random) {
    let pool = seriesId ? await Card.query().where({ seriesId, active: true }) : []
    if (!pool.length || random() >= 0.5) pool = await Card.query().where('active', true)
    if (!pool.length) return null
    const rarity = pickRarity(new Set(pool.map((card) => card.rarity)), random)
    const candidates = pool.filter((card) => card.rarity === rarity)
    const card = candidates[Math.floor(random() * candidates.length)] ?? candidates[0]
    return this.give(userId, card)
  }

  async shards(userId: number) {
    const rows = await db.from('user_shards').where('user_id', userId).select('rarity', 'amount')
    const result = Object.fromEntries(rarities.map((rarity) => [rarity, 0])) as Record<
      Rarity,
      number
    >
    for (const row of rows)
      if (row.rarity in result) result[row.rarity as Rarity] = Number(row.amount)
    return result
  }

  async collection(userId: number) {
    const [cards, owned, shards] = await Promise.all([
      Card.query()
        .where('active', true)
        .preload('series', (series) => series.preload('contentType'))
        .orderBy('rarity', 'asc')
        .orderBy('id', 'asc'),
      db.from('user_cards').where('user_id', userId).select('card_id', 'count'),
      this.shards(userId),
    ])
    const counts = new Map(owned.map((row) => [Number(row.card_id), Number(row.count)]))
    const order = (rarity: Rarity) => rarities.indexOf(rarity)
    return {
      shards,
      cards: cards
        .sort((a, b) => order(b.rarity) - order(a.rarity) || a.id - b.id)
        .map((card) => ({
          id: card.id,
          name: card.name,
          image: card.image,
          rarity: card.rarity,
          count: counts.get(card.id) ?? 0,
          series: card.series
            ? {
                title: card.series.title,
                url: `/series/${card.series.contentType?.slug}/${card.series.slug}`,
              }
            : null,
        })),
    }
  }

  async ownedCount(userId: number) {
    const [row] = await db.from('user_cards').where('user_id', userId).count('* as total')
    return Number(row.total)
  }

  /** Breaks every duplicate of a card into shards of its rarity. */
  async disassemble(userId: number, cardId: number) {
    return db.transaction(async (trx) => {
      const owned = await trx
        .from('user_cards')
        .join('cards', 'cards.id', 'user_cards.card_id')
        .where('user_cards.user_id', userId)
        .where('user_cards.card_id', cardId)
        .select('user_cards.id', 'user_cards.count', 'cards.rarity')
        .first()
      if (!owned || owned.count < 2) return null
      const rarity = owned.rarity as Rarity
      const gained = (owned.count - 1) * rarityRules[rarity].shards
      // Only the request that still sees the same count may convert the copies, so two
      // concurrent clicks cannot both earn shards for them.
      const changed = await trx
        .from('user_cards')
        .where('id', owned.id)
        .where('count', owned.count)
        .update({ count: 1 })
      if (!(Number(changed) > 0)) return null
      const row = await trx.from('user_shards').where({ user_id: userId, rarity }).first()
      if (row) await trx.from('user_shards').where('id', row.id).increment('amount', gained)
      else await trx.table('user_shards').insert({ user_id: userId, rarity, amount: gained })
      return { rarity, gained }
    })
  }

  /** Spends shards for a random card of that rarity, preferring cards the reader is missing. */
  async craft(userId: number, rarity: Rarity, random: Random = Math.random) {
    const pool = await Card.query().where({ rarity, active: true })
    if (!pool.length) return { error: 'Bu nadirlikte henüz kart yok.' }
    const cost = rarityRules[rarity].craft
    const spent = await db.transaction(async (trx) => {
      const changed = await trx
        .from('user_shards')
        .where({ user_id: userId, rarity })
        .where('amount', '>=', cost)
        .decrement('amount', cost)
      return Number(changed) > 0
    })
    if (!spent) return { error: `Üretmek için ${cost} ${rarity} parçası gerekir.` }
    const ownedRows = await db.from('user_cards').where('user_id', userId).select('card_id')
    const owned = new Set(ownedRows.map((row) => Number(row.card_id)))
    const missing = pool.filter((card) => !owned.has(card.id))
    const candidates = missing.length && random() < 0.7 ? missing : pool
    const card = candidates[Math.floor(random() * candidates.length)] ?? candidates[0]
    await this.give(userId, card, false)
    return { card: { id: card.id, name: card.name, image: card.image, rarity: card.rarity } }
  }

  /** Admin helper: one card per series that has a cover and no card yet, with weighted rarity. */
  async createFromSeries(random: Random = Math.random) {
    const series = await SeriesModel.query()
      .whereNotIn('id', db.from('cards').whereNotNull('series_id').select('series_id'))
      .select('id', 'title', 'coverImage')
    const timestamp = now()
    const rows = series
      .filter((item) => item.coverImage?.startsWith('/'))
      .map((item) => ({
        series_id: item.id,
        name: item.title.slice(0, 80),
        image: item.coverImage,
        rarity: pickRarity(new Set(rarities), random) ?? 'F',
        active: true,
        created_at: timestamp,
        updated_at: timestamp,
      }))
    for (let index = 0; index < rows.length; index += 200)
      await db.table('cards').multiInsert(rows.slice(index, index + 200))
    return rows.length
  }
}

export default new CardService()
