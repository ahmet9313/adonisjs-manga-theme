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
  /**
   * How covers of age-rated series appear in lists, cards, search and the series page (manga
   * sites hide adult covers the same way). Per rating under Admin → Tema → Yaş ve Erişim; a series
   * can override it in its form (`series.cover_mode`). `placeholder` never sends the real image:
   * the default image (uploadable on that page) takes its place, banners are left out.
   */
  coverPolicies: { '18+': 'blur', '16+': 'show', '13+': 'show', '7+': 'show' } as Record<
    string,
    CoverMode
  >,
  coverModes: {
    show: { label: 'Göster', icon: 'eye', hint: 'Kapak olduğu gibi görünür.' },
    blur: {
      label: 'Bulanıklaştır',
      icon: 'eye-off',
      hint: 'Kapak bulanık ve yaş etiketiyle görünür.',
    },
    placeholder: {
      label: 'Varsayılan görsel',
      icon: 'photo',
      hint: 'Kapak yerine varsayılan görsel gösterilir; asıl görsel gönderilmez.',
    },
  } as Record<CoverMode, { label: string; icon: string; hint: string }>,
  /**
   * Who sees the real cover of a hidden one (`cover_reveal`): nobody, visitors who confirmed
   * their age at the age gate, signed-in members, or members who also confirmed their age.
   */
  coverReveals: {
    none: { label: 'Kimse', hint: 'Gizli kapaklar herkese gizli kalır.' },
    age: {
      label: 'Yaşını onaylayanlar',
      hint: 'Yaş uyarısında yaşını onaylayan herkes (üye olmasa da) asıl kapağı görür.',
    },
    members: {
      label: 'Üyeler',
      hint: 'Giriş yapmış üyeler asıl kapağı görür; ziyaretçilere gizli kalır.',
    },
    members_age: {
      label: 'Yaşını onaylayan üyeler',
      hint: 'Hem giriş yapmış hem yaşını onaylamış olmak gerekir.',
    },
  } as Record<CoverReveal, { label: string; hint: string }>,
  /** Built-in image for `placeholder` when none is uploaded. */
  hiddenCover: '/images/hidden-cover.svg',
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
  /**
   * Accounts whose e-mail is not confirmed yet always keep reading and saving series. When
   * true, they cannot write comments or reviews until they confirm (false limits nothing).
   */
  requireVerifiedToPost: false as boolean,
  /** Lifetimes of mailed account links (single use). */
  accountLinks: { resetMinutes: 60, verifyDays: 7 },
}

export type ContentFormat = keyof typeof site.contentFormats
export type CoverMode = 'show' | 'blur' | 'placeholder'
export const coverModeKeys: CoverMode[] = ['show', 'blur', 'placeholder']
export type CoverReveal = 'none' | 'age' | 'members' | 'members_age'
export const coverRevealKeys: CoverReveal[] = ['none', 'age', 'members', 'members_age']
/** A series follows its age rating (`auto`) or sets its own cover mode. */
export type SeriesCoverMode = 'auto' | CoverMode
export const seriesCoverModeKeys: SeriesCoverMode[] = ['auto', ...coverModeKeys]
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
