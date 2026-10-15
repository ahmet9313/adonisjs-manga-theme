/** Site-wide presentation and content rules. Keep deployment secrets in .env. */
const site = {
  name: 'MangaHub',
  logo: null as string | null,
  recruitmentUrl: null as string | null,
  description: 'Türkçe manga, manhwa, manhua, webtoon ve novel okuma platformu.',
  language: 'tr',
  /** Daily check-in and "today" boundaries follow this time zone. */
  timezone: 'Europe/Istanbul',
  statuses: ['Devam Ediyor', 'Tamamlandı', 'Bırakıldı'] as const,
  translationStatuses: ['Aktif', 'Tamamlandı', 'Bırakıldı'] as const,
  ageRatings: ['7+', '13+', '16+', '18+'] as const,
  adminPageSizes: [10, 20, 30, 50, 100],
  /**
   * Badge colour tones (`ui/badge`, `data-tone`). Colours are theme tokens (`--t-badge-<tone>`,
   * Admin → Tema → Renkler → Rozetler); content types use their slug as the tone.
   */
  badgeTones: {
    type: ['manga', 'manhwa', 'manhua', 'novel', 'webtoon'],
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

export default site
