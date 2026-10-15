import { avatarMotifs, type AvatarMotif } from './art.js'
import {
  bios,
  displayTags,
  firstNames,
  handlePrefixes,
  handleSuffixes,
  slug,
  type Voice,
} from './corpus.js'
import type { Rng } from './rng.js'

export type Archetype = 'staff' | 'veteran' | 'critic' | 'regular' | 'casual' | 'newbie' | 'lurker'

export interface Person {
  username: string
  fullName: string
  role: 'admin' | 'editor' | 'member'
  archetype: Archetype
  bio: string | null
  hue: number
  motif: AvatarMotif
  voice: Voice
  hasBanner: boolean
  /** Join date (ms). */
  createdAt: number
  lastSeenAt: number
  exp: number
  streak: number
  bestStreak: number
  /** Today (0) or yesterday (1) when the streak is alive, otherwise null. */
  checkinDaysAgo: number | null
  /** Relative chance to write comments. */
  talk: number
  /** How many series this person follows. */
  followed: [number, number]
  /** Chance that a rating comes with a written review. */
  reviewChance: number
  /** Filled in when the account row exists. */
  id?: number
}

interface Spec {
  count: number
  exp: [number, number]
  ageDays: [number, number]
  talk: number
  followed: [number, number]
  reviewChance: number
  streak: [number, number]
  aliveChance: number
  onlineChance: number
}

const specs: Record<Archetype, Spec> = {
  staff: {
    count: 3,
    exp: [3500, 9000],
    ageDays: [90, 140],
    talk: 1.3,
    followed: [10, 20],
    reviewChance: 0.5,
    streak: [6, 40],
    aliveChance: 0.9,
    onlineChance: 0.5,
  },
  veteran: {
    count: 8,
    exp: [6000, 30000],
    ageDays: [70, 130],
    talk: 3,
    followed: [14, 30],
    reviewChance: 0.7,
    streak: [8, 45],
    aliveChance: 0.85,
    onlineChance: 0.35,
  },
  critic: {
    count: 6,
    exp: [3000, 12000],
    ageDays: [50, 110],
    talk: 2,
    followed: [10, 22],
    reviewChance: 0.9,
    streak: [3, 25],
    aliveChance: 0.7,
    onlineChance: 0.2,
  },
  regular: {
    count: 24,
    exp: [800, 5000],
    ageDays: [20, 90],
    talk: 2,
    followed: [5, 14],
    reviewChance: 0.4,
    streak: [1, 14],
    aliveChance: 0.55,
    onlineChance: 0.12,
  },
  casual: {
    count: 22,
    exp: [150, 1200],
    ageDays: [5, 50],
    talk: 1,
    followed: [2, 7],
    reviewChance: 0.15,
    streak: [0, 4],
    aliveChance: 0.3,
    onlineChance: 0.08,
  },
  newbie: {
    count: 10,
    exp: [50, 250],
    ageDays: [0.2, 6],
    talk: 0.5,
    followed: [0, 2],
    reviewChance: 0.05,
    streak: [0, 2],
    aliveChance: 0.4,
    onlineChance: 0.15,
  },
  lurker: {
    count: 4,
    exp: [400, 2500],
    ageDays: [15, 70],
    talk: 0.1,
    followed: [6, 16],
    reviewChance: 0,
    streak: [0, 6],
    aliveChance: 0.3,
    onlineChance: 0.05,
  },
}

const staffPeople: [string, string, string][] = [
  [
    'ceviri_ayse',
    'Ayşe | Çeviri Ekibi',
    'Çeviri ekibi üyesi. Hatalı bir yer görürseniz yorumlardan haber verin 💚',
  ],
  ['editor_mehmet', 'Mehmet | Editör', 'Editör. Bölümleri kontrol eder, yorumlarınızı okurum.'],
  ['temizlik_ece', 'Ece | Temizlik', 'Sayfa temizliği ve düzenleme. Kahve olmadan çalışmam ☕'],
]

const voices: [Voice, number][] = [
  ['normal', 5],
  ['lower', 3],
  ['emoji', 3],
  ['stretch', 1],
  ['formal', 1],
  ['shout', 0.4],
]

const DAY = 86_400_000

function pickVoice(rng: Rng): Voice {
  return rng.weighted(voices)
}

/** Creates the cast. `scale` shrinks it for tests; every archetype keeps at least one member. */
export function planPeople(rng: Rng, scale: number, now: number): Person[] {
  const people: Person[] = []
  const usernames = new Set<string>()
  const names = rng.shuffle(firstNames)
  let nameIndex = 0

  const uniqueUsername = (base: string) => {
    let name = base.slice(0, 20)
    for (let index = 2; usernames.has(name); index++) name = `${base.slice(0, 17)}${index}`
    usernames.add(name)
    return name
  }

  const make = (archetype: Archetype, fixed?: [string, string, string]): Person => {
    const spec = specs[archetype]
    let username: string
    let fullName: string
    let bio: string | null
    if (fixed) {
      username = uniqueUsername(fixed[0])
      fullName = fixed[1]
      bio = fixed[2]
    } else {
      const first = names[nameIndex++ % names.length]
      const base = `${rng.pick(handlePrefixes)}${slug(first)}${rng.pick(handleSuffixes)}`
      username = uniqueUsername(base.length >= 3 ? base : `${base}_oku`)
      const style = rng.int(0, 3)
      fullName =
        style === 0
          ? first
          : style === 1
            ? `${first}${rng.pick(displayTags)}`
            : style === 2
              ? username
              : `${first} ${rng.pick(['K.', 'M.', 'A.', 'S.', 'T.'])}`
      bio = rng.pick(bios) || null
    }
    const exp = rng.int(spec.exp[0], spec.exp[1])
    const ageDays = spec.ageDays[0] + rng.next() * (spec.ageDays[1] - spec.ageDays[0])
    const streak = rng.int(spec.streak[0], spec.streak[1])
    const alive = rng.chance(spec.aliveChance)
    const online = rng.chance(spec.onlineChance)
    // Time since last visit: online now, within a day, or days ago (never before joining).
    const away = online
      ? rng.next() * 4 * 60_000
      : rng.chance(0.5)
        ? (0.05 + rng.next() * 0.95) * DAY
        : (1 + rng.next() * Math.min(ageDays, 30)) * DAY
    return {
      username,
      fullName,
      role: archetype === 'staff' ? 'editor' : 'member',
      archetype,
      bio,
      hue: rng.int(0, 359),
      motif: rng.pick(avatarMotifs),
      voice: archetype === 'staff' ? 'normal' : pickVoice(rng),
      hasBanner: rng.chance(archetype === 'newbie' ? 0.15 : 0.55),
      createdAt: now - ageDays * DAY,
      lastSeenAt: Math.max(now - ageDays * DAY, now - away),
      exp,
      streak: alive ? streak : 0,
      bestStreak: Math.max(streak, alive ? streak : rng.int(0, streak + 5)),
      checkinDaysAgo: alive ? (rng.chance(0.6) ? 0 : 1) : null,
      talk: spec.talk * (0.7 + rng.next() * 0.6),
      followed: spec.followed,
      reviewChance: spec.reviewChance,
    }
  }

  const archetypes = Object.keys(specs) as Archetype[]
  for (const archetype of archetypes) {
    const wanted = Math.max(1, Math.round(specs[archetype].count * scale))
    for (let index = 0; index < wanted; index++)
      people.push(
        make(archetype, archetype === 'staff' ? staffPeople[index % staffPeople.length] : undefined)
      )
  }
  return people
}

export function pickMotif(rng: Rng): AvatarMotif {
  return rng.pick(avatarMotifs)
}
