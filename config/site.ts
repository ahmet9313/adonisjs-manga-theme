/** Site-wide presentation and content rules. Keep deployment secrets in .env. */
const site = {
  name: 'MangaHub',
  logo: null as string | null,
  /** Optional narrower logo for phones and the browser tab icon (Admin → Tema → Genel). */
  logoMobile: null as string | null,
  favicon: null as string | null,
  recruitmentUrl: null as string | null,
  description: 'Türkçe manga, manhwa, manhua, webtoon ve novel okuma platformu.',
  language: 'tr',
  /** Daily check-in and "today" boundaries follow this time zone. */
  timezone: 'Europe/Istanbul',
  statuses: ['Devam Ediyor', 'Tamamlandı', 'Bırakıldı'] as const,
  translationStatuses: ['Aktif', 'Tamamlandı', 'Bırakıldı'] as const,
  ageRatings: ['7+', '13+', '16+', '18+'] as const,
  /**
   * What happens before an age-rated series opens (Admin → Tema → Yaş ve Erişim can change it):
   * `none`, `warn` (the visitor confirms their age once; a cookie remembers it) or `members`
   * (the visitor must also sign in). Confirming a higher rating covers the lower ones.
   */
  agePolicies: { '18+': 'members', '16+': 'warn', '13+': 'none', '7+': 'none' } as Record<
    string,
    AgePolicy
  >,
  agePolicyLabels: {
    none: 'Uyarı yok',
    warn: 'Yaş uyarısı',
    members: 'Yaş uyarısı + üyelik',
  } as Record<AgePolicy, string>,
  /** Who may open a series or chapter. Staff (admin, editor) may always. */
  accessLevels: {
    public: { label: 'Herkes', chapterLabel: 'Seriyle aynı', icon: 'globe' },
    members: { label: 'Üyelere özel', chapterLabel: 'Üyelere özel', icon: 'user' },
    vip: { label: "VIP'lere özel", chapterLabel: "VIP'lere özel", icon: 'star' },
  },
  adminPageSizes: [10, 20, 30, 50, 100],
  /**
   * The three kinds of content a type can be (`content_types.format`, chosen under Admin →
   * İçerik Türleri). It decides the chapter editor (pages, text or video sources), the reader
   * or player and whether the site says "oku" or "izle".
   */
  contentFormats: {
    image: {
      label: 'Görsel',
      icon: 'photo',
      hint: 'Bölümler sayfa görselleriyle eklenir ve okunur (manga, manhwa, manhua, webtoon).',
    },
    text: {
      label: 'Metin',
      icon: 'document',
      hint: 'Bölümler metin olarak yazılır ve okunur (novel).',
    },
    video: {
      label: 'Video',
      icon: 'video',
      hint: 'Bölümler video kaynaklarıyla eklenir ve izlenir (anime).',
    },
  },
  /**
   * Badge colour tones (`ui/badge`, `data-tone`). Colours are theme tokens (`--t-badge-<tone>`,
   * Admin → Tema → Renkler → Rozetler); content types use their slug as the tone.
   */
  badgeTones: {
    type: ['manga', 'manhwa', 'manhua', 'novel', 'webtoon', 'anime'],
    status: {
      'Devam Ediyor': 'ongoing',
      'Aktif': 'ongoing',
      'Tamamlandı': 'completed',
      'Bırakıldı': 'dropped',
    },
    age: { '18+': 'age18', '16+': 'age16', '13+': 'age13', '7+': 'age7' },
  } as {
    type: string[]
    status: Record<string, string>
    age: Record<string, string>
  },
  socialLinks: [] as { label: string; url: string }[],
}

export type ContentFormat = keyof typeof site.contentFormats
export type AgePolicy = 'none' | 'warn' | 'members'
export const agePolicyKeys: AgePolicy[] = ['none', 'warn', 'members']
export type AccessLevel = keyof typeof site.accessLevels
export const accessLevelKeys = Object.keys(site.accessLevels) as AccessLevel[]

export const contentFormatKeys = Object.keys(site.contentFormats) as ContentFormat[]

/** Slug fragments that suggest a format when none is chosen (quick add, seeders). */
const formatHints: [string, ContentFormat][] = [
  ['novel', 'text'],
  ['anime', 'video'],
  ['donghua', 'video'],
]

/** Format suggested for a content type from its slug; everything else is pages. */
export const suggestedFormat = (slug: string): ContentFormat =>
  formatHints.find(([hint]) => slug.includes(hint))?.[1] ?? 'image'

export default site
