/**
 * Progression without purchases: EXP comes from reading, commenting and the daily check-in.
 * Levels unlock cosmetics; badges are milestones that also grant EXP.
 */
export const maxLevel = 100

export const exp = {
  signup: 50,
  /** First read of a chapter. Rapid page flipping is throttled in the progress service. */
  chapterRead: 10,
  comment: 5,
  /** First rating or review of a series (editing it again earns nothing). */
  review: 15,
  checkinBase: 20,
  /** Added per consecutive day, capped at `checkinStreakCap` days. */
  checkinStreakBonus: 5,
  checkinStreakCap: 7,
}

/** EXP needed to go from `level` to `level + 1`. */
export const expToNext = (level: number) => 100 + (level - 1) * 50

export type Metric =
  | 'chapters'
  | 'comments'
  | 'likesReceived'
  | 'streak'
  | 'level'
  | 'cards'
  | 'profileLikes'
  | 'reviews'
  | 'helpfulReceived'

export interface BadgeDefinition {
  slug: string
  name: string
  description: string
  icon: string
  /** Tailwind gradient used behind the icon. */
  tone: string
  metric: Metric
  goal: number
  exp: number
}

export const badges: BadgeDefinition[] = [
  {
    slug: 'ilk-adim',
    name: 'İlk Adım',
    description: 'İlk bölümünü oku.',
    icon: '📖',
    tone: 'from-emerald-500 to-teal-600',
    metric: 'chapters',
    goal: 1,
    exp: 20,
  },
  {
    slug: 'okur',
    name: 'Okur',
    description: '25 bölüm oku.',
    icon: '📚',
    tone: 'from-sky-500 to-indigo-600',
    metric: 'chapters',
    goal: 25,
    exp: 60,
  },
  {
    slug: 'kitap-kurdu',
    name: 'Kitap Kurdu',
    description: '100 bölüm oku.',
    icon: '🐛',
    tone: 'from-lime-500 to-emerald-700',
    metric: 'chapters',
    goal: 100,
    exp: 150,
  },
  {
    slug: 'efsane-okur',
    name: 'Efsane Okur',
    description: '500 bölüm oku.',
    icon: '👑',
    tone: 'from-amber-400 to-orange-600',
    metric: 'chapters',
    goal: 500,
    exp: 400,
  },
  {
    slug: 'soz-sende',
    name: 'Söz Sende',
    description: 'İlk yorumunu yaz.',
    icon: '💬',
    tone: 'from-cyan-500 to-blue-600',
    metric: 'comments',
    goal: 1,
    exp: 20,
  },
  {
    slug: 'yorumcu',
    name: 'Yorumcu',
    description: '50 yorum yaz.',
    icon: '🗣️',
    tone: 'from-violet-500 to-fuchsia-600',
    metric: 'comments',
    goal: 50,
    exp: 150,
  },
  {
    slug: 'sevilen',
    name: 'Sevilen',
    description: 'Yorumların toplam 25 artı oy alsın.',
    icon: '❤️',
    tone: 'from-rose-500 to-pink-600',
    metric: 'likesReceived',
    goal: 25,
    exp: 100,
  },
  {
    slug: 'sadik',
    name: 'Sadık',
    description: '7 gün üst üste günlük giriş yap.',
    icon: '🔥',
    tone: 'from-orange-500 to-red-600',
    metric: 'streak',
    goal: 7,
    exp: 100,
  },
  {
    slug: 'adanmis',
    name: 'Adanmış',
    description: '30 gün üst üste günlük giriş yap.',
    icon: '☄️',
    tone: 'from-red-500 to-purple-700',
    metric: 'streak',
    goal: 30,
    exp: 300,
  },
  {
    slug: 'elestirmen',
    name: 'Eleştirmen',
    description: '5 seriye inceleme yaz.',
    icon: '✍️',
    tone: 'from-indigo-500 to-violet-600',
    metric: 'reviews',
    goal: 5,
    exp: 100,
  },
  {
    slug: 'faydali',
    name: 'Rehber',
    description: 'İncelemelerin toplam 20 "faydalı" oy alsın.',
    icon: '🧭',
    tone: 'from-teal-400 to-cyan-600',
    metric: 'helpfulReceived',
    goal: 20,
    exp: 120,
  },
  {
    slug: 'koleksiyoncu',
    name: 'Koleksiyoncu',
    description: '10 farklı kart topla.',
    icon: '🃏',
    tone: 'from-yellow-400 to-amber-600',
    metric: 'cards',
    goal: 10,
    exp: 100,
  },
  {
    slug: 'tecrubeli',
    name: 'Tecrübeli',
    description: 'Seviye 10’a ulaş.',
    icon: '⭐',
    tone: 'from-yellow-300 to-yellow-600',
    metric: 'level',
    goal: 10,
    exp: 0,
  },
  {
    slug: 'populer',
    name: 'Popüler',
    description: 'Profilin 10 beğeni alsın.',
    icon: '🌟',
    tone: 'from-pink-400 to-purple-600',
    metric: 'profileLikes',
    goal: 10,
    exp: 80,
  },
]

/** Card rarities from common to rare. Duplicates break into shards of the same rarity. */
export const rarities = ['F', 'D', 'C', 'B', 'A', 'S', 'R'] as const
export type Rarity = (typeof rarities)[number]

export const rarityRules: Record<
  Rarity,
  { weight: number; shards: number; craft: number; label: string }
> = {
  F: { weight: 40, shards: 1, craft: 3, label: 'Sıradan' },
  D: { weight: 25, shards: 2, craft: 6, label: 'Yaygın' },
  C: { weight: 15, shards: 5, craft: 15, label: 'Nadir olmayan' },
  B: { weight: 10, shards: 10, craft: 30, label: 'Nadir' },
  A: { weight: 6, shards: 25, craft: 75, label: 'Destansı' },
  S: { weight: 3, shards: 60, craft: 180, label: 'Efsanevi' },
  R: { weight: 1, shards: 150, craft: 450, label: 'Kalıntı' },
}

export const isRarity = (value: unknown): value is Rarity =>
  typeof value === 'string' && (rarities as readonly string[]).includes(value)

export const cardDrops = {
  /** Chance that the first read of a chapter drops a card. */
  readChance: 0.12,
  /** Every n-th consecutive check-in day guarantees a card. */
  checkinEvery: 7,
}

/** Online dot: seen within this many minutes. */
export const onlineMinutes = 5
