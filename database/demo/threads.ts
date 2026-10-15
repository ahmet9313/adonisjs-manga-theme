import {
  applyVoice,
  chapterComments,
  fill,
  gifFor,
  replyTemplates,
  seriesComments,
  spoilerComments,
  type CommentKind,
  type TextContext,
} from './corpus.js'
import type { Person } from './people.js'
import type { Rng } from './rng.js'

export interface DemoChapter {
  id: number
  number: number
  /** Publication date (ms). */
  publishedAt: number
}

export interface DemoSeries {
  id: number
  title: string
  slug: string
  type: string
  genres: string[]
  /** Popularity weight (0.5 – 3). */
  weight: number
  /** Typical rating a reader gives (1–10). */
  baseRating: number
  chapters: DemoChapter[]
}

export interface DraftComment {
  id: number
  userId: number
  seriesId: number
  chapterId: number | null
  parent: DraftComment | null
  rootId: number | null
  depth: number
  body: string
  image: string | null
  stickerId: number | null
  spoiler: boolean
  /** Creation time (ms). */
  at: number
  kind: CommentKind | 'chat'
  likes: number
  dislikes: number
  replies: number
  deleted: boolean
}

export interface ThreadOptions {
  rng: Rng
  people: Person[]
  series: DemoSeries[]
  now: number
  scale: number
  /** Sticker ids a person may use (unlocked at their level). */
  stickersFor: (person: Person) => number[]
  /** Animated GIF slugs available on disk. */
  gifSlugs: string[]
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const seriesKinds: [Exclude<CommentKind, 'reaction'>, number][] = [
  ['praise', 30],
  ['question', 18],
  ['prediction', 8],
  ['complaint', 10],
  ['thanks', 8],
  ['joke', 14],
  ['recommend', 12],
]
const chapterKinds: [CommentKind, number][] = [
  ['reaction', 80],
  ['joke', 8],
  ['question', 5],
  ['complaint', 4],
  ['thanks', 3],
]

/** Builds every comment thread in memory; ids and vote counts are assigned by the caller. */
export function generateThreads(options: ThreadOptions): DraftComment[] {
  const { rng, people, series, now, scale } = options
  const staff = people.filter((person) => person.archetype === 'staff')
  const comments: DraftComment[] = []
  const gifPath = (slug: string) => `/content/seed/gifs/${slug}.gif`

  const pickAuthor = (at: number, avoid?: number) => {
    const joined = people.filter(
      (person) => person.createdAt < at && person.talk > 0.05 && person.id !== avoid
    )
    const pool = joined.length ? joined : people.filter((person) => person.id !== avoid)
    return rng.weighted(pool.map((person) => [person, person.talk] as const))
  }

  const draft = (
    thread: { seriesId: number; chapterId: number | null },
    parent: DraftComment | null,
    author: Person,
    kind: DraftComment['kind'],
    text: string,
    at: number,
    spoiler = false
  ): DraftComment => {
    let body = applyVoice(text, author.voice, rng)
    if (parent && parent.userId !== author.id && rng.chance(parent.depth === 0 ? 0.2 : 0.5)) {
      const target = people.find((person) => person.id === parent.userId)
      if (target) body = `@${target.username} ${body}`
    }
    let image: string | null = null
    let stickerId: number | null = null
    const roll = rng.next()
    if (roll < 0.06 && options.gifSlugs.length) {
      const fitting = gifFor[kind].filter((slug) => options.gifSlugs.includes(slug))
      image = gifPath(fitting.length ? rng.pick(fitting) : rng.pick(options.gifSlugs))
      // Reaction-only comments are common.
      if (rng.chance(0.25)) body = ''
    } else if (roll < 0.12) {
      const stickers = options.stickersFor(author)
      if (stickers.length) {
        stickerId = rng.pick(stickers)
        if (rng.chance(0.3)) body = ''
      }
    }
    const comment: DraftComment = {
      id: 0,
      userId: author.id!,
      seriesId: thread.seriesId,
      chapterId: thread.chapterId,
      parent,
      rootId: null,
      depth: parent ? parent.depth + 1 : 0,
      body,
      image,
      stickerId,
      spoiler,
      at,
      // A sticker/GIF-only comment gets generic answers, not ones that quote its (dropped) text.
      kind: body ? kind : 'chat',
      likes: 0,
      dislikes: 0,
      replies: 0,
      deleted: false,
    }
    if (parent) parent.replies++
    comments.push(comment)
    return comment
  }

  /** Reply chain under a root comment. */
  const grow = (
    thread: { seriesId: number; chapterId: number | null },
    root: DraftComment,
    context: TextContext,
    hot: boolean
  ) => {
    const roll = rng.next()
    const count = hot
      ? rng.int(5, 12)
      : roll < 0.58
        ? 0
        : roll < 0.86
          ? rng.int(1, 2)
          : roll < 0.96
            ? rng.int(3, 5)
            : rng.int(6, 11)
    const members = [root]
    const used = new Set<string>()
    for (let index = 0; index < count; index++) {
      let parent = rng.chance(0.5) ? root : rng.pick(members)
      if (parent.depth >= 6) parent = root
      const gap = (1 + rng.next() * 5) * HOUR * (1 + parent.depth * 0.4)
      const at = Math.min(parent.at + 60_000 + rng.next() * gap, now - 2 * MINUTE)
      if (at <= parent.at + 30_000) continue
      // Translators answer thanks and questions now and then.
      const staffReply =
        staff.length &&
        ['thanks', 'question'].includes(parent.kind) &&
        parent.depth === 0 &&
        rng.chance(0.35)
      const author = staffReply
        ? rng.pick(staff)
        : pickAuthor(at, rng.chance(0.9) ? parent.userId : undefined)
      const key = parent.depth === 0 || rng.chance(0.3) ? (root.kind as CommentKind) : 'chat'
      const kind: DraftComment['kind'] = staffReply && parent.kind === 'thanks' ? 'thanks' : key
      let text = fill(rng.pick(replyTemplates[kind]), context)
      for (let attempt = 0; attempt < 4 && used.has(text); attempt++)
        text = fill(rng.pick(replyTemplates[kind]), context)
      used.add(text)
      members.push(draft(thread, parent, author, kind, text, at))
    }
  }

  const seriesTitles = series.map((item) => item.title)
  const otherTitle = (own: string) => rng.pick(seriesTitles.filter((title) => title !== own)) ?? own
  const spread = (min: number) => Math.max(min, 0)

  for (const item of series) {
    // ---- Series page thread -----------------------------------------------------------------
    const seriesThread = { seriesId: item.id, chapterId: null }
    const roots = Math.max(
      1,
      Math.round((3.5 + 7 * item.weight) * Math.pow(scale, 0.85) * (0.75 + rng.next() * 0.5))
    )
    for (let index = 0; index < roots; index++) {
      const at = now - 20 * MINUTE - (75 * DAY - 20 * MINUTE) * Math.pow(rng.next(), 1.7)
      const author = pickAuthor(at)
      const kind = rng.weighted(seriesKinds)
      const context: TextContext = { t: item.title, o: otherTitle(item.title) }
      const text = fill(rng.pick(seriesComments[kind]), context)
      const spoiler = rng.chance(0.01)
      const root = draft(seriesThread, null, author, kind, text, at, spoiler)
      grow(seriesThread, root, context, index === 0 && item.weight > 2 && scale >= 0.5)
    }

    // ---- Chapter threads --------------------------------------------------------------------
    if (!item.chapters.length) continue
    const byNumber = [...item.chapters].sort((a, b) => a.number - b.number)
    const wanted = Math.min(
      byNumber.length,
      Math.max(1, Math.round((1.5 + 1.8 * item.weight) * Math.pow(scale, 0.7)))
    )
    const chosen = new Set<DemoChapter>([byNumber[byNumber.length - 1]])
    if (wanted > 1) chosen.add(byNumber[0])
    if (wanted > 2) chosen.add(byNumber[byNumber.length - 2] ?? byNumber[0])
    for (const chapter of rng.sample(byNumber, wanted)) {
      if (chosen.size >= wanted) break
      chosen.add(chapter)
    }
    let latest = true
    for (const chapter of [...chosen].reverse()) {
      const thread = { seriesId: item.id, chapterId: chapter.id }
      const from = Math.max(chapter.publishedAt, now - 60 * DAY)
      const window = spread(now - 10 * MINUTE - from)
      if (window < 5 * MINUTE) continue
      const base = (2 + 3 * item.weight) * Math.pow(scale, 0.8) * (latest ? 1.8 : 1)
      const total = Math.max(1, Math.round(base * (0.6 + rng.next() * 0.8)))
      for (let index = 0; index < total; index++) {
        const at = now - 10 * MINUTE - window * Math.pow(rng.next(), 1.4)
        const author = pickAuthor(at)
        const context: TextContext = { t: item.title, o: otherTitle(item.title), n: chapter.number }
        const spoilerRoll = rng.chance(0.06)
        const kind = spoilerRoll ? 'reaction' : rng.weighted(chapterKinds)
        const text = spoilerRoll
          ? rng.pick(spoilerComments)
          : kind === 'reaction'
            ? fill(rng.pick(chapterComments), context)
            : fill(rng.pick(seriesComments[kind as Exclude<CommentKind, 'reaction'>]), context)
        const root = draft(thread, null, author, kind, text, at, spoilerRoll)
        grow(thread, root, context, latest && index === 0 && item.weight > 2 && scale >= 0.5)
      }
      latest = false
    }
  }

  return comments
}
