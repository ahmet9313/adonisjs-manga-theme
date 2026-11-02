import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { badges, rarities, rarityRules, type Rarity } from '#config/rewards'
import cosmetics from '#services/cosmetic_service'
import { levelFor } from '#services/level'
import { avatarSvg, bannerSvg, cardArtSvg } from './art.js'
import { reactionGifs } from './animations.js'
import { buildExtraCosmetics, DEMO_SLUG_PREFIX } from './catalog.js'
import { incomingTitles, replyTemplates, writeReview, fill } from './corpus.js'
import { renderAnimation } from './gif.js'
import { planPeople, type Person } from './people.js'
import { createRng, type Rng } from './rng.js'
import { generateThreads, type DemoSeries } from './threads.js'

/** Demo accounts use this e-mail domain, which is how they are recognised (and removed). */
export const DEMO_EMAIL_DOMAIN = 'demo.mangahub.local'
export const DEMO_PASSWORD = 'demo1234'

const DAY = 86_400_000
const HOUR = 3_600_000
const MINUTE = 60_000

export interface CommunityOptions {
  /** Directory the generated images are written to (the site's content root). */
  contentRoot: string
  /** 1 = the full community (~77 accounts); tests use a small fraction. */
  scale?: number
  seed?: number
  /** Limits how many reaction GIFs are rendered (rendering takes ~2 s for all of them). */
  gifLimit?: number
  /** Also hand every pre-existing account the test equipment (default true). */
  realAccounts?: boolean
  log?: (message: string) => void
}

export interface CommunityReport {
  users: number
  comments: number
  replies: number
  reviews: number
  ratings: number
  cosmetics: number
  cards: number
  gifs: number
  skipped?: string
}

type Trx = TransactionClientContract

/* ---- Small helpers ----------------------------------------------------------------------- */

const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

function toMs(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  const text = String(value ?? '')
  if (!text) return Number.NaN
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return Date.parse(`${text}T00:00:00Z`)
  return Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`)
}

type Rows = PromiseLike<Record<string, unknown>[]>

/** One column of every row as numbers. */
async function numbers(query: Rows, name: string) {
  const rows = await query
  return rows.map((row) => Number(row[name]))
}

/** One column of every row as strings. */
async function texts(query: Rows, name: string) {
  const rows = await query
  return rows.map((row) => String(row[name]))
}

/** Highest value of a column (0 when the table is empty). */
async function topOf(client: Trx | typeof db, table: string, name: string) {
  const [row] = await client.from(table).max(`${name} as top`)
  return Number(row?.top ?? 0)
}

/** Rewrites a series' denormalised rating columns from its review rows. */
async function refreshRatings(trx: Trx, seriesId: number) {
  const [stats] = await trx
    .from('series_reviews')
    .where('series_id', seriesId)
    .count('* as total')
    .avg('rating as average')
  const [written] = await trx
    .from('series_reviews')
    .where('series_id', seriesId)
    .whereNotNull('body')
    .whereNot('body', '')
    .count('* as total')
  await trx
    .from('series')
    .where('id', seriesId)
    .update({
      rating_avg: Number(stats.total) ? Math.round(Number(stats.average) * 100) / 100 : 0,
      rating_count: Number(stats.total),
      review_count: Number(written.total),
    })
}

async function insertAll(trx: Trx, table: string, rows: Record<string, unknown>[], size = 120) {
  for (let index = 0; index < rows.length; index += size)
    await trx.table(table).multiInsert(rows.slice(index, index + size))
}

async function nextId(client: Trx | typeof db, table: string) {
  return (await topOf(client, table, 'id')) + 1
}

async function writeFiles(root: string, files: { path: string; content: string | Buffer }[]) {
  for (const file of files) {
    const target = join(root, file.path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, file.content)
  }
}

/** Popularity (comment/rating volume) and typical rating per demo series. */
const popular: Record<string, [number, number]> = {
  'naruto': [3, 8.1],
  'one-piece': [3, 9],
  'attack-on-titan': [2.8, 8.8],
  'death-note': [2.4, 9],
  'jujutsu-kaisen': [2.6, 8.4],
  'chainsaw-man': [2.2, 8.3],
  'demon-slayer': [2.3, 7.9],
  'black-clover': [1.4, 7.5],
  'bleach': [1.8, 8.1],
  'dragon-ball-super': [1.5, 7.2],
  'solo-leveling': [3, 8.6],
  'tower-of-god': [2, 8.4],
  'the-beginning-after-the-end': [2, 8.5],
  'omniscient-reader': [2.4, 9],
  'true-beauty': [1.3, 7.9],
  'sweet-home': [1.2, 7.6],
  'falling': [0.7, 6.8],
  'lookism': [1.8, 8],
  'tales-of-demons-and-gods': [1.2, 7.4],
  'martial-peak': [1.1, 7.5],
  'soul-land': [1, 7.7],
  'battle-through-the-heavens': [1.1, 7.9],
  'mushoku-tensei': [1.6, 8.8],
  'overlord': [1.4, 8.2],
  're-zero': [1.5, 8.3],
  'summer-season': [0.6, 6.9],
  'lore-olympus': [1, 7.2],
  'unordinary': [1.5, 8],
  'my-hero-academia': [2.2, 8],
  'tokyo-ghoul': [2.2, 8.4],
  'spy-x-family': [2, 8.6],
  'vinland-saga': [1.6, 9],
  'hunter-x-hunter': [2.2, 9.2],
  'fullmetal-alchemist': [2, 9.2],
  'one-punch-man': [2.2, 8.7],
  'nano-machine': [1.6, 8.2],
  'eleceed': [1.5, 8.8],
  'tomb-raider-king': [1, 7.8],
  'return-of-the-mount-hua-sect': [1.6, 9],
  'the-breaker': [0.9, 7.9],
  'weak-hero': [1.4, 8.7],
  'the-great-ruler': [0.8, 7.8],
  'apotheosis': [0.8, 7.6],
  'versatile-mage': [0.9, 7.7],
  'against-the-gods': [0.9, 7.5],
  'sword-art-online': [1.5, 7.3],
  'that-time-i-got-reincarnated-as-a-slime': [1.6, 8.4],
  'the-rising-of-the-shield-hero': [1.5, 7.8],
  'noblesse': [1.4, 8.3],
  'god-of-high-school': [1.3, 7.9],
  'bastard': [1.3, 8.9],
  'windbreaker': [1, 8.1],
  'hardcore-leveling-warrior': [0.9, 7.4],
}

/** Rating habits: critics are harsher, casual readers more generous. */
const ratingBias: Record<string, number> = {
  critic: -0.5,
  veteran: -0.2,
  staff: 0,
  regular: 0,
  casual: 0.4,
  newbie: 0.6,
  lurker: 0,
}
const rateChance: Record<string, number> = {
  critic: 1,
  veteran: 0.9,
  staff: 0.5,
  regular: 0.6,
  casual: 0.35,
  newbie: 0.1,
  lurker: 0.6,
}
const cardTarget: Record<string, [number, number]> = {
  veteran: [30, 70],
  critic: [15, 35],
  staff: [10, 25],
  regular: [8, 25],
  casual: [2, 10],
  newbie: [0, 3],
  lurker: [5, 15],
}

interface CosmeticRow {
  id: number
  kind: string
  slug: string
  required_level: number
  required_badge: string | null
  grant_only: unknown
  active: unknown
}

const isTrue = (value: unknown) => value === true || value === 1 || value === '1'

/** Rows that anyone of `level` may use without a gift or badge. */
const reachable = (rows: CosmeticRow[], kind: string, level: number) =>
  rows.filter(
    (row) =>
      row.kind === kind &&
      isTrue(row.active) &&
      !isTrue(row.grant_only) &&
      !row.required_badge &&
      row.required_level <= level
  )

/* ---- Build ------------------------------------------------------------------------------ */

export async function buildCommunity(options: CommunityOptions): Promise<CommunityReport | null> {
  const log = options.log ?? (() => {})
  const scale = options.scale ?? 1
  const rng = createRng(options.seed ?? 20261015)
  const now = Date.now()
  const root = options.contentRoot

  const already = await db.from('users').where('email', 'like', `%@${DEMO_EMAIL_DOMAIN}`).first()
  if (already) {
    log('Demo topluluk zaten mevcut; yeniden oluşturulmadı.')
    if (options.realAccounts !== false) await equipRealAccounts(rng, now, log)
    return null
  }

  const seriesRows = await db
    .from('series')
    .join('content_types', 'content_types.id', 'series.content_type_id')
    .select(
      'series.id',
      'series.title',
      'series.slug',
      'series.cover_image',
      'content_types.slug as type'
    )
    .orderBy('series.id')
  if (!seriesRows.length) {
    log('Seri bulunamadı; önce örnek içeriği yükleyin (series_seeder).')
    return {
      users: 0,
      comments: 0,
      replies: 0,
      reviews: 0,
      ratings: 0,
      cosmetics: 0,
      cards: 0,
      gifs: 0,
      skipped: 'no-series',
    }
  }
  const genreRows = await db
    .from('series_genres')
    .join('genres', 'genres.id', 'series_genres.genre_id')
    .select('series_genres.series_id', 'genres.name')
  const chapterRows = await db.from('chapters').select('id', 'series_id', 'number', 'published_at')

  const genres = new Map<number, string[]>()
  for (const row of genreRows)
    genres.set(Number(row.series_id), [
      ...(genres.get(Number(row.series_id)) ?? []),
      String(row.name),
    ])
  const chapters = new Map<number, DemoSeries['chapters']>()
  for (const row of chapterRows) {
    const list = chapters.get(Number(row.series_id)) ?? []
    list.push({
      id: Number(row.id),
      number: Number(row.number),
      publishedAt: Math.min(toMs(row.published_at) || now - 30 * DAY, now - HOUR),
    })
    chapters.set(Number(row.series_id), list)
  }
  const series: DemoSeries[] = seriesRows.map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    type: String(row.type),
    genres: genres.get(Number(row.id)) ?? [],
    weight: popular[String(row.slug)]?.[0] ?? 1,
    baseRating: popular[String(row.slug)]?.[1] ?? 7.4,
    chapters: chapters.get(Number(row.id)) ?? [],
  }))
  const seriesById = new Map(series.map((item) => [item.id, item]))

  /* ---- Files ---------------------------------------------------------------------------- */
  const people = planPeople(rng, scale, now)
  const files: { path: string; content: string | Buffer }[] = []
  const gifTargets = reactionGifs.slice(0, options.gifLimit ?? reactionGifs.length)
  for (const gif of gifTargets)
    files.push({ path: `seed/gifs/${gif.slug}.gif`, content: renderAnimation(gif.spec) })
  for (const person of people) {
    files.push({
      path: `seed/avatars/${person.username}.svg`,
      content: avatarSvg(person.username, person.motif, person.hue),
    })
    if (person.hasBanner)
      files.push({
        path: `seed/banners/${person.username}.svg`,
        content: bannerSvg(person.username, person.hue),
      })
  }
  const extras = buildExtraCosmetics()
  for (const item of extras)
    if (item.file) files.push({ path: item.file.path, content: item.file.content() })
  log(`${files.length} görsel dosyası yazılıyor…`)
  await writeFiles(root, files)

  const passwordHash = await hash.make(DEMO_PASSWORD)

  const report = await db.transaction(async (trx) => {
    /* ---- Cosmetics -------------------------------------------------------------------- */
    const present = new Set(await texts(trx.from('cosmetics'), 'slug'))
    let cosmeticId = await nextId(trx, 'cosmetics')
    let sortOrder = (await topOf(trx, 'cosmetics', 'sort_order')) + 1
    const cosmeticStamp = stamp(now - 120 * DAY)
    const cosmeticInserts = extras
      .filter((item) => !present.has(item.slug))
      .map((item) => ({
        id: cosmeticId++,
        kind: item.kind,
        slug: item.slug,
        name: item.name,
        image: item.file ? `/content/${item.file.path}` : null,
        style: item.style ?? null,
        required_level: item.level,
        required_badge: item.badge ?? null,
        grant_only: Boolean(item.grantOnly),
        featured: Boolean(item.featured),
        active: true,
        sort_order: sortOrder++,
        created_at: cosmeticStamp,
        updated_at: cosmeticStamp,
      }))
    await insertAll(trx, 'cosmetics', cosmeticInserts)
    const catalog = (await trx
      .from('cosmetics')
      .select(
        'id',
        'kind',
        'slug',
        'required_level',
        'required_badge',
        'grant_only',
        'active'
      )) as CosmeticRow[]
    const levelOf = (person: Person) => levelFor(person.exp).level
    const stickerIds = new Map<string, number[]>()
    const stickersFor = (person: Person) => {
      const level = levelOf(person)
      const key = String(level)
      if (!stickerIds.has(key))
        stickerIds.set(
          key,
          reachable(catalog, 'sticker', level).map((row) => row.id)
        )
      return stickerIds.get(key)!
    }

    /* ---- Accounts --------------------------------------------------------------------- */
    let userId = await nextId(trx, 'users')
    for (const person of people) person.id = userId++
    const userRows = people.map((person) => {
      const level = levelOf(person)
      const pickFor = (kind: string, chance: number) => {
        const usable = reachable(catalog, kind, level)
        return usable.length && rng.chance(chance) ? rng.pick(usable).id : null
      }
      const checkin =
        person.checkinDaysAgo === null
          ? null
          : new Date(now - person.checkinDaysAgo * DAY).toISOString().slice(0, 10)
      return {
        id: person.id,
        full_name: person.fullName,
        email: `${person.username}@${DEMO_EMAIL_DOMAIN}`,
        password: passwordHash,
        username: person.username,
        role: person.role,
        avatar: `/content/seed/avatars/${person.username}.svg`,
        banner: person.hasBanner ? `/content/seed/banners/${person.username}.svg` : null,
        bio: person.bio,
        banned_at: null,
        // Demo addresses cannot receive mail; the accounts count as confirmed.
        email_verified_at: stamp(person.createdAt),
        last_login_at: stamp(person.lastSeenAt),
        exp: person.exp,
        streak: person.streak,
        best_streak: person.bestStreak,
        last_checkin_on: checkin,
        last_seen_at: stamp(person.lastSeenAt),
        frame_id: pickFor('frame', 0.65),
        effect_id: pickFor('effect', 0.55),
        wallpaper_id: pickFor('wallpaper', 0.55),
        profile_like_count: 0,
        created_at: stamp(person.createdAt),
        updated_at: stamp(person.lastSeenAt),
      }
    })
    await insertAll(trx, 'users', userRows)
    const byId = new Map(people.map((person) => [person.id!, person]))

    /* ---- Reading history and saved series -------------------------------------------- */
    const reads: Record<string, unknown>[] = []
    const marks: Record<string, unknown>[] = []
    const readCount = new Map<number, number>()
    for (const person of people) {
      const count = Math.min(series.length, rng.int(person.followed[0], person.followed[1]))
      const picks: DemoSeries[] = []
      const pool = [...series]
      for (let index = 0; index < count && pool.length; index++) {
        const item = rng.weighted(pool.map((entry) => [entry, entry.weight] as const))
        pool.splice(pool.indexOf(item), 1)
        picks.push(item)
      }
      let total = 0
      for (const item of picks) {
        const list = [...item.chapters].sort((a, b) => a.number - b.number)
        if (!list.length) continue
        const newbie = person.archetype === 'newbie'
        const binge = ['veteran', 'critic'].includes(person.archetype) && rng.chance(0.55)
        const upTo = binge
          ? list.length
          : newbie
            ? Math.min(list.length, rng.int(1, 3))
            : Math.max(1, Math.ceil(list.length * Math.pow(rng.next(), 0.8)))
        let at = Math.max(person.createdAt, now - 80 * DAY) + rng.next() * 2 * DAY
        for (const chapter of list.slice(0, upTo)) {
          at += rng.chance(0.15) ? (1 + rng.next() * 2) * DAY : (3 + rng.next() * 40) * MINUTE
          if (at > now - MINUTE) at = now - rng.int(1, 600) * 1000
          reads.push({
            user_id: person.id,
            series_id: item.id,
            chapter_id: chapter.id,
            read_at: stamp(at),
          })
          total++
        }
        if (rng.chance(0.65))
          marks.push({
            user_id: person.id,
            series_id: item.id,
            created_at: stamp(Math.max(person.createdAt, at - rng.next() * 20 * DAY)),
          })
      }
      readCount.set(person.id!, total)
    }
    await insertAll(trx, 'chapter_reads', reads, 200)
    await insertAll(trx, 'bookmarks', marks, 200)

    /* ---- Comments ---------------------------------------------------------------------- */
    log('Yorumlar ve yanıtlar oluşturuluyor…')
    const drafts = generateThreads({
      rng,
      people,
      series,
      now,
      scale,
      stickersFor,
      gifSlugs: gifTargets.map((gif) => gif.slug),
    })
    // Soft-delete a few comments that have replies ("Bu yorum silindi").
    for (const draft of drafts) if (draft.replies > 0 && rng.chance(0.012)) draft.deleted = true
    drafts.sort((a, b) => a.at - b.at)
    let commentId = await nextId(trx, 'comments')
    for (const draft of drafts) draft.id = commentId++
    for (const draft of drafts)
      draft.rootId = draft.parent ? (draft.parent.rootId ?? draft.parent.id) : null

    const voters = people.map((person) => person.id!)
    const votes: Record<string, unknown>[] = []
    const likeTotals = new Map<number, number>()
    for (const draft of drafts) {
      const cap = Math.min(voters.length - 1, 45)
      const weight = 0.6 + 0.4 * (seriesById.get(draft.seriesId)?.weight ?? 1)
      const up = Math.min(cap, rng.longTail(draft.depth === 0 ? 1.8 * weight : 0.9 * weight, cap))
      const down = rng.chance(0.45) ? Math.min(cap - up, rng.longTail(0.45, 10)) : 0
      const chosen = rng.sample(
        voters.filter((id) => id !== draft.userId),
        up + down
      )
      draft.likes = Math.min(up, chosen.length)
      draft.dislikes = Math.max(0, chosen.length - draft.likes)
      chosen.forEach((voter, index) =>
        votes.push({
          user_id: voter,
          comment_id: draft.id,
          value: index < draft.likes ? 1 : -1,
          created_at: stamp(Math.min(now - 30_000, draft.at + rng.next() * 3 * DAY)),
        })
      )
      likeTotals.set(draft.userId, (likeTotals.get(draft.userId) ?? 0) + draft.likes)
    }
    const commentRows = drafts.map((draft) => ({
      id: draft.id,
      user_id: draft.userId,
      series_id: draft.seriesId,
      chapter_id: draft.chapterId,
      parent_id: draft.parent?.id ?? null,
      root_id: draft.rootId,
      depth: draft.depth,
      body: draft.deleted ? '' : draft.body,
      image: draft.deleted ? null : draft.image,
      spoiler: draft.deleted ? false : draft.spoiler,
      like_count: draft.likes,
      dislike_count: draft.dislikes,
      reply_count: draft.replies,
      sticker_id: draft.deleted ? null : draft.stickerId,
      deleted_at: draft.deleted ? stamp(draft.at + rng.next() * DAY) : null,
      created_at: stamp(draft.at),
      updated_at: stamp(draft.at),
    }))
    await insertAll(trx, 'comments', commentRows, 100)
    await insertAll(trx, 'comment_likes', votes, 250)

    /* ---- Ratings and reviews ----------------------------------------------------------- */
    log('Puanlar ve incelemeler oluşturuluyor…')
    const reviewRows: Record<string, unknown>[] = []
    const reviewVotes: Record<string, unknown>[] = []
    const reviewCounts = new Map<number, number>()
    const helpfulTotals = new Map<number, number>()
    let reviewId = await nextId(trx, 'series_reviews')
    for (const item of series) {
      const wanted = Math.round(
        (3 + 16 * item.weight) * Math.pow(scale, 0.8) * (0.7 + rng.next() * 0.6)
      )
      const raters = rng
        .shuffle(people)
        .filter((person) => rng.chance(rateChance[person.archetype] ?? 0.3))
        .slice(0, Math.min(wanted, people.length))
      for (const person of raters) {
        const rating = Math.max(
          1,
          Math.min(
            10,
            Math.round(rng.gauss(item.baseRating + (ratingBias[person.archetype] ?? 0), 1.35))
          )
        )
        const bodyChance = Math.min(0.95, person.reviewChance + 0.1)
        const text = rng.chance(bodyChance)
          ? writeReview(
              rating,
              { title: item.title, other: rng.pick(series).title, genres: item.genres },
              rng
            )
          : null
        const at =
          now -
          5 * MINUTE -
          Math.min(now - person.createdAt - 10 * MINUTE, 90 * DAY) * Math.pow(rng.next(), 1.5)
        const edited = text && rng.chance(0.06)
        const helpful = text
          ? Math.min(voters.length - 1, rng.longTail(2.2 * (0.5 + 0.2 * item.weight), 30))
          : 0
        const chosen = rng.sample(
          voters.filter((id) => id !== person.id),
          helpful
        )
        const id = reviewId++
        reviewRows.push({
          id,
          user_id: person.id,
          series_id: item.id,
          rating,
          title: text?.title ?? null,
          body: text?.body ?? null,
          spoiler: Boolean(text) && rng.chance(0.07),
          helpful_count: chosen.length,
          created_at: stamp(at),
          updated_at: stamp(edited ? Math.min(now - MINUTE, at + (1 + rng.next() * 6) * DAY) : at),
        })
        for (const voter of chosen)
          reviewVotes.push({
            user_id: voter,
            review_id: id,
            created_at: stamp(Math.min(now - 30_000, at + rng.next() * 5 * DAY)),
          })
        if (text) {
          reviewCounts.set(person.id!, (reviewCounts.get(person.id!) ?? 0) + 1)
          helpfulTotals.set(person.id!, (helpfulTotals.get(person.id!) ?? 0) + chosen.length)
        }
      }
    }
    await insertAll(trx, 'series_reviews', reviewRows, 100)
    await insertAll(trx, 'review_votes', reviewVotes, 250)
    // Pre-existing (real) ratings count too, so recompute instead of overwriting.
    for (const item of series) await refreshRatings(trx, item.id)

    /* ---- Cards and shards -------------------------------------------------------------- */
    log('Kartlar oluşturuluyor…')
    const cardStamp = stamp(now - 100 * DAY)
    let cardId = await nextId(trx, 'cards')
    const haveCards = new Set(
      await numbers(trx.from('cards').whereNotNull('series_id'), 'series_id')
    )
    const rarityWeights: [Rarity, number][] = rarities.map((rarity) => [
      rarity,
      rarityRules[rarity].weight,
    ])
    const baseCards = series
      .filter((item) => !haveCards.has(item.id))
      .map((item) => ({
        id: cardId++,
        series_id: item.id,
        name: item.title.slice(0, 80),
        image: String(
          seriesRows.find((row) => Number(row.id) === item.id)?.cover_image ||
            '/images/no-cover.svg'
        ),
        rarity: rng.weighted(rarityWeights),
        active: true,
        created_at: cardStamp,
        updated_at: cardStamp,
      }))
    const suffixes = [
      'Efsane Baskı',
      'Gece Versiyonu',
      'Altın Çerçeve',
      'Kahraman',
      'Final Sahnesi',
      'Kapak Özel',
      'Koleksiyon',
      'Sınırlı Baskı',
    ]
    const altRarities: [Rarity, number][] = [
      ['B', 25],
      ['C', 20],
      ['A', 25],
      ['S', 20],
      ['R', 10],
    ]
    const altFiles: { path: string; content: string }[] = []
    const altCards = series
      .filter((item) => item.weight >= 1 || rng.chance(0.6))
      .map((item) => {
        const rarity = rng.weighted(altRarities)
        const path = `seed/cards/${item.slug}-alt.svg`
        altFiles.push({ path, content: cardArtSvg(item.title, rarity, rng.int(0, 359), item.slug) })
        return {
          id: cardId++,
          series_id: item.id,
          name: `${item.title} — ${rng.pick(suffixes)}`.slice(0, 80),
          image: `/content/${path}`,
          rarity,
          active: true,
          created_at: cardStamp,
          updated_at: cardStamp,
        }
      })
    await writeFiles(root, altFiles)
    await insertAll(trx, 'cards', [...baseCards, ...altCards])
    const allCards = (await trx.from('cards').where('active', true).select('id', 'rarity')) as {
      id: number
      rarity: Rarity
    }[]
    const cardsOwned = new Map<number, number>()
    const ownedRows: Record<string, unknown>[] = []
    const shardRows: Record<string, unknown>[] = []
    for (const person of people) {
      const [low, high] = cardTarget[person.archetype] ?? [2, 10]
      const wanted = Math.min(allCards.length, rng.int(low, high))
      const pool = [...allCards]
      const chosen: typeof allCards = []
      for (let index = 0; index < wanted && pool.length; index++) {
        const card = rng.weighted(
          pool.map((entry) => [entry, rarityRules[entry.rarity].weight] as const)
        )
        pool.splice(pool.indexOf(card), 1)
        chosen.push(card)
      }
      cardsOwned.set(person.id!, chosen.length)
      const shards: Partial<Record<Rarity, number>> = {}
      for (const card of chosen) {
        const count = 1 + (rng.chance(0.25) ? rng.longTail(1.2, 4) : 0)
        ownedRows.push({
          user_id: person.id,
          card_id: card.id,
          count,
          obtained_at: stamp(Math.max(person.createdAt, now - rng.next() * 70 * DAY)),
        })
        if (count > 1 && rng.chance(0.5))
          shards[card.rarity] =
            (shards[card.rarity] ?? 0) + rarityRules[card.rarity].shards * rng.int(1, count - 1)
      }
      for (const [rarity, amount] of Object.entries(shards))
        if (amount) shardRows.push({ user_id: person.id, rarity, amount })
    }
    await insertAll(trx, 'user_cards', ownedRows, 200)
    await insertAll(trx, 'user_shards', shardRows, 200)

    /* ---- Profile likes ------------------------------------------------------------------ */
    const likeRows: Record<string, unknown>[] = []
    const profileLikes = new Map<number, number>()
    for (const person of people) {
      const appeal =
        { staff: 6, veteran: 5, critic: 3.5, regular: 1.5, casual: 0.6, newbie: 0.3, lurker: 0.2 }[
          person.archetype
        ] ?? 1
      const wanted = Math.min(people.length - 1, rng.longTail(appeal, 28))
      const chosen = rng.sample(
        voters.filter((id) => id !== person.id),
        wanted
      )
      profileLikes.set(person.id!, chosen.length)
      for (const voter of chosen)
        likeRows.push({
          user_id: voter,
          member_id: person.id,
          created_at: stamp(now - rng.next() * 60 * DAY),
        })
    }
    await insertAll(trx, 'profile_likes', likeRows, 250)

    /* ---- Gifts, badges and counters ------------------------------------------------------- */
    const grantOnly = catalog.filter((row) => isTrue(row.grant_only) && isTrue(row.active))
    const giftRows: Record<string, unknown>[] = []
    for (const person of people) {
      const gifts =
        person.archetype === 'staff'
          ? grantOnly
          : person.archetype === 'veteran' && rng.chance(0.3)
            ? [rng.pick(grantOnly)]
            : []
      for (const row of gifts)
        giftRows.push({
          user_id: person.id,
          cosmetic_id: row.id,
          created_at: stamp(now - rng.next() * 40 * DAY),
        })
    }
    await insertAll(trx, 'user_cosmetics', giftRows, 200)

    const commentsBy = new Map<number, number>()
    for (const draft of drafts)
      if (!draft.deleted) commentsBy.set(draft.userId, (commentsBy.get(draft.userId) ?? 0) + 1)
    const badgeRows: Record<string, unknown>[] = []
    for (const person of people) {
      const metrics: Record<string, number> = {
        chapters: readCount.get(person.id!) ?? 0,
        comments: commentsBy.get(person.id!) ?? 0,
        likesReceived: likeTotals.get(person.id!) ?? 0,
        streak: Math.max(person.bestStreak, person.streak),
        level: levelOf(person),
        cards: cardsOwned.get(person.id!) ?? 0,
        profileLikes: profileLikes.get(person.id!) ?? 0,
        reviews: reviewCounts.get(person.id!) ?? 0,
        helpfulReceived: helpfulTotals.get(person.id!) ?? 0,
      }
      for (const badge of badges)
        if ((metrics[badge.metric] ?? 0) >= badge.goal)
          badgeRows.push({
            user_id: person.id,
            badge: badge.slug,
            earned_at: stamp(
              person.createdAt + rng.next() * Math.max(HOUR, now - person.createdAt)
            ),
          })
    }
    await insertAll(trx, 'user_badges', badgeRows, 250)
    for (const person of people)
      await trx
        .from('users')
        .where('id', person.id!)
        .update({ profile_like_count: profileLikes.get(person.id!) ?? 0 })

    /* ---- Notifications -------------------------------------------------------------------- */
    const notices: Record<string, unknown>[] = []
    const linkFor = (draft: { seriesId: number; chapterId: number | null }) => {
      const item = seriesById.get(draft.seriesId)!
      const chapter = draft.chapterId
        ? item.chapters.find((entry) => entry.id === draft.chapterId)
        : null
      return `/series/${item.type}/${item.slug}${chapter ? `/${chapter.number}` : ''}#yorumlar`
    }
    const readStamp = (at: number) =>
      now - at > 2 * DAY || rng.chance(0.3) ? stamp(at + rng.next() * HOUR) : null
    for (const draft of drafts) {
      if (!draft.parent || draft.parent.userId === draft.userId || draft.deleted) continue
      if (!rng.chance(0.3)) continue
      const replier = byId.get(draft.userId)!
      notices.push({
        user_id: draft.parent.userId,
        category: 'activity',
        title: incomingTitles.reply(replier.fullName),
        body: (
          draft.body || (draft.stickerId ? 'Bir çıkartma gönderdi.' : 'Bir görsel gönderdi.')
        ).slice(0, 140),
        link: linkFor(draft),
        read_at: readStamp(draft.at),
        created_at: stamp(draft.at),
      })
    }
    for (const person of people) {
      notices.push({
        user_id: person.id,
        category: 'system',
        title: 'Topluluğa hoş geldin!',
        body: 'Kayıt olduğun için +50 EXP kazandın. Okudukça, yorum yaptıkça ve her gün giriş yaptıkça seviye atlayıp yeni çerçeve, efekt ve çıkartmalar açabilirsin.',
        link: '/oduller',
        read_at: stamp(person.createdAt + HOUR),
        created_at: stamp(person.createdAt),
      })
    }
    for (const row of badgeRows.slice(0, 600)) {
      const badge = badges.find((entry) => entry.slug === row.badge)!
      notices.push({
        user_id: row.user_id,
        category: 'reward',
        title: `Rozet kazandın: ${badge.icon} ${badge.name}`,
        body: `${badge.description}${badge.exp ? ` +${badge.exp} EXP.` : ''}`,
        link: '/rozetler',
        read_at: readStamp(toMs(row.earned_at)),
        created_at: String(row.earned_at),
      })
    }
    await insertAll(trx, 'notifications', notices, 200)

    return {
      users: people.length,
      comments: drafts.length,
      replies: drafts.filter((draft) => draft.parent).length,
      reviews: reviewRows.filter((row) => row.body).length,
      ratings: reviewRows.length,
      cosmetics: cosmeticInserts.length,
      cards: baseCards.length + altCards.length,
      gifs: gifTargets.length,
    } satisfies CommunityReport
  })

  cosmetics.invalidate()
  if (options.realAccounts !== false) await equipRealAccounts(rng, now, log)
  return report
}

/* ---- Pre-existing accounts: test equipment and conversation ------------------------------ */

/**
 * Hands every non-demo account the whole cosmetic catalog, a large card collection and shards,
 * and lets demo readers answer and like their comments. Safe to run repeatedly.
 */
export async function equipRealAccounts(
  rng: Rng,
  now: number,
  log: (message: string) => void = () => {}
) {
  const accounts = await db
    .from('users')
    .whereNot('email', 'like', `%@${DEMO_EMAIL_DOMAIN}`)
    .select('id', 'username', 'full_name')
  if (!accounts.length) return
  const demo = await db
    .from('users')
    .where('email', 'like', `%@${DEMO_EMAIL_DOMAIN}`)
    .select('id', 'username', 'full_name')

  await db.transaction(async (trx) => {
    const catalog = await trx.from('cosmetics').where('active', true).select('id')
    const cards = await trx.from('cards').where('active', true).select('id', 'rarity')
    for (const account of accounts) {
      const owned = new Set(
        await numbers(trx.from('user_cosmetics').where('user_id', account.id), 'cosmetic_id')
      )
      await insertAll(
        trx,
        'user_cosmetics',
        catalog
          .filter((row) => !owned.has(Number(row.id)))
          .map((row) => ({
            user_id: account.id,
            cosmetic_id: row.id,
            created_at: stamp(now - rng.next() * 5 * DAY),
          })),
        200
      )

      const hasCards = new Set(
        await numbers(trx.from('user_cards').where('user_id', account.id), 'card_id')
      )
      await insertAll(
        trx,
        'user_cards',
        cards
          .filter((card) => !hasCards.has(Number(card.id)) && rng.chance(0.88))
          .map((card) => ({
            user_id: account.id,
            card_id: card.id,
            count: 1 + (rng.chance(0.3) ? rng.int(1, 3) : 0),
            obtained_at: stamp(now - rng.next() * 20 * DAY),
          })),
        200
      )
      const haveShards = new Set(
        await texts(trx.from('user_shards').where('user_id', account.id), 'rarity')
      )
      await insertAll(
        trx,
        'user_shards',
        rarities
          .filter((rarity) => !haveShards.has(rarity))
          .map((rarity) => ({
            user_id: account.id,
            rarity,
            amount: rng.int(10, 120) * Math.max(1, Math.round(rarityRules[rarity].craft / 20)),
          })),
        50
      )
    }

    if (!demo.length) return
    for (const account of accounts) {
      // Profile likes from demo readers.
      const liked = new Set(
        await numbers(trx.from('profile_likes').where('member_id', account.id), 'user_id')
      )
      const likers = rng.sample(
        demo.filter((row) => !liked.has(Number(row.id))),
        liked.size >= 6 ? 0 : rng.int(8, 14)
      )
      if (likers.length) {
        await insertAll(
          trx,
          'profile_likes',
          likers.map((row) => ({
            user_id: row.id,
            member_id: account.id,
            created_at: stamp(now - rng.next() * 12 * DAY),
          }))
        )
        await trx
          .from('users')
          .where('id', account.id)
          .increment('profile_like_count', likers.length)
        for (const row of likers.slice(0, 4))
          await trx.table('notifications').insert({
            user_id: account.id,
            category: 'activity',
            title: incomingTitles.profileLike(String(row.full_name)),
            body: `@${row.username} profilini beğendi.`,
            link: `/uye/${account.username}`,
            read_at: null,
            created_at: stamp(now - rng.next() * 3 * DAY),
          })
      }

      // Replies and votes under their existing comments.
      const mine = await trx
        .from('comments')
        .where('user_id', account.id)
        .whereNull('deleted_at')
        .select('id', 'series_id', 'chapter_id', 'root_id', 'depth', 'created_at')
      for (const comment of mine) {
        const answered = await trx
          .from('comments')
          .where('parent_id', comment.id)
          .whereIn(
            'user_id',
            demo.map((row) => row.id)
          )
          .first()
        if (answered || !rng.chance(0.85)) continue
        const target = await trx
          .from('series')
          .join('content_types', 'content_types.id', 'series.content_type_id')
          .where('series.id', comment.series_id)
          .select('series.slug', 'content_types.slug as type')
          .first()
        const chapter = comment.chapter_id
          ? await trx.from('chapters').where('id', comment.chapter_id).select('number').first()
          : null
        const link = `/series/${target.type}/${target.slug}${chapter ? `/${chapter.number}` : ''}#yorumlar`
        const base = Math.max(toMs(comment.created_at) || now - DAY, now - 20 * DAY)
        let id = await nextId(trx, 'comments')
        const replies = rng.int(1, 3)
        for (let index = 0; index < replies; index++) {
          const author = rng.pick(demo)
          // Somewhere between 15 minutes after the comment and a few minutes ago.
          const span = Math.max(HOUR, now - 5 * MINUTE - base)
          const at = Math.min(base + 15 * MINUTE + rng.next() * span, now - 2 * MINUTE)
          const body = `@${account.username} ${fill(rng.pick(replyTemplates.chat), { t: '', o: '' })}`
          const replyId = id++
          await trx.table('comments').insert({
            id: replyId,
            user_id: author.id,
            series_id: comment.series_id,
            chapter_id: comment.chapter_id,
            parent_id: comment.id,
            root_id: comment.root_id ?? comment.id,
            depth: Number(comment.depth) + 1,
            body,
            image: null,
            spoiler: false,
            like_count: 0,
            dislike_count: 0,
            reply_count: 0,
            sticker_id: null,
            deleted_at: null,
            created_at: stamp(at),
            updated_at: stamp(at),
          })
          const upVoters = rng.sample(
            demo.filter((row) => row.id !== author.id),
            rng.int(0, 4)
          )
          if (upVoters.length) {
            await insertAll(
              trx,
              'comment_likes',
              upVoters.map((row) => ({
                user_id: row.id,
                comment_id: replyId,
                value: 1,
                created_at: stamp(Math.min(now - 30_000, at + rng.next() * DAY)),
              }))
            )
            await trx.from('comments').where('id', replyId).update({ like_count: upVoters.length })
          }
          await trx.table('notifications').insert({
            user_id: account.id,
            category: 'activity',
            title: incomingTitles.reply(String(author.full_name)),
            body: body.slice(0, 140),
            link,
            read_at: index === 0 && rng.chance(0.5) ? stamp(at + HOUR) : null,
            created_at: stamp(at),
          })
        }
        await trx.from('comments').where('id', comment.id).increment('reply_count', replies)
        const voters = rng.sample(demo, rng.int(2, 8))
        const existing = new Set(
          await numbers(trx.from('comment_likes').where('comment_id', comment.id), 'user_id')
        )
        const fresh = voters.filter((row) => !existing.has(Number(row.id)))
        await insertAll(
          trx,
          'comment_likes',
          fresh.map((row) => ({
            user_id: row.id,
            comment_id: comment.id,
            value: 1,
            created_at: stamp(now - rng.next() * 5 * DAY),
          }))
        )
        await trx.from('comments').where('id', comment.id).increment('like_count', fresh.length)
      }
    }
  })
  cosmetics.invalidate()
  log(`${accounts.length} mevcut hesaba test ekipmanı ve etkileşim eklendi.`)
}

/* ---- Removal ------------------------------------------------------------------------------ */

/** Removes everything the demo build created (demo accounts, their content and generated files). */
export async function clearCommunity(
  contentRoot: string,
  log: (message: string) => void = () => {}
) {
  await db.transaction(async (trx) => {
    const demo = await numbers(
      trx.from('users').where('email', 'like', `%@${DEMO_EMAIL_DOMAIN}`),
      'id'
    )
    if (demo.length) {
      // Comments written by demo accounts, plus everything replying under them.
      let doomed = await numbers(trx.from('comments').whereIn('user_id', demo), 'id')
      const all = new Set(doomed)
      while (doomed.length) {
        const found = await numbers(trx.from('comments').whereIn('parent_id', doomed), 'id')
        const children = found.filter((id) => !all.has(id))
        for (const id of children) all.add(id)
        doomed = children
      }
      const ids = [...all].sort((a, b) => b - a)
      const survivors = new Set<number>()
      for (let index = 0; index < ids.length; index += 200) {
        const slice = ids.slice(index, index + 200)
        for (const row of await trx
          .from('comments')
          .whereIn('id', slice)
          .whereNotNull('parent_id')
          .select('parent_id'))
          if (!all.has(Number(row.parent_id))) survivors.add(Number(row.parent_id))
        await trx.from('comment_likes').whereIn('comment_id', slice).delete()
      }
      // Deepest first so no row ever points at a deleted parent.
      for (let index = 0; index < ids.length; index += 200)
        await trx
          .from('comments')
          .whereIn('id', ids.slice(index, index + 200))
          .delete()
      for (const id of survivors) {
        const [row] = await trx.from('comments').where('parent_id', id).count('* as total')
        await trx
          .from('comments')
          .where('id', id)
          .update({ reply_count: Number(row.total) })
      }
      for (const table of [
        'comment_likes',
        'review_votes',
        'profile_likes',
        'user_cosmetics',
        'user_cards',
        'user_shards',
        'user_badges',
        'notifications',
        'chapter_reads',
        'bookmarks',
        'series_reviews',
        'remember_me_tokens',
      ] as const) {
        const column = table === 'remember_me_tokens' ? 'tokenable_id' : 'user_id'
        await trx.from(table).whereIn(column, demo).delete()
      }
      await trx.from('profile_likes').whereIn('member_id', demo).delete()
      await trx.from('users').whereIn('id', demo).delete()
    }

    // Generated cosmetics and cards.
    const generated = await trx
      .from('cosmetics')
      .where('slug', 'like', `${DEMO_SLUG_PREFIX}%`)
      .select('id', 'kind')
    const items = generated.map((row) => ({ id: Number(row.id), kind: String(row.kind) }))
    for (const [kind, column] of [
      ['frame', 'frame_id'],
      ['effect', 'effect_id'],
      ['wallpaper', 'wallpaper_id'],
    ] as const) {
      const ids = items.filter((item) => item.kind === kind).map((item) => item.id)
      if (ids.length)
        await trx
          .from('users')
          .whereIn(column, ids)
          .update({ [column]: null })
    }
    const stickers = items.filter((item) => item.kind === 'sticker').map((item) => item.id)
    if (stickers.length)
      await trx.from('comments').whereIn('sticker_id', stickers).update({ sticker_id: null })
    if (items.length) {
      await trx
        .from('user_cosmetics')
        .whereIn(
          'cosmetic_id',
          items.map((item) => item.id)
        )
        .delete()
      await trx
        .from('cosmetics')
        .whereIn(
          'id',
          items.map((item) => item.id)
        )
        .delete()
    }
    const altCards = await numbers(
      trx.from('cards').where('image', 'like', '/content/seed/%'),
      'id'
    )
    if (altCards.length) {
      await trx.from('user_cards').whereIn('card_id', altCards).delete()
      await trx.from('cards').whereIn('id', altCards).delete()
    }

    // Series aggregates follow the remaining ratings.
    for (const row of await trx.from('series').select('id'))
      await refreshRatings(trx, Number(row.id))
  })
  await rm(join(contentRoot, 'seed'), { recursive: true, force: true })
  cosmetics.invalidate()
  log('Demo topluluk ve oluşturulan dosyalar silindi.')
}
