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
  socialLinks: [] as { label: string; url: string }[],
}

export default site
