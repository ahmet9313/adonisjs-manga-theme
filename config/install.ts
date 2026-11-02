/**
 * First-run setup wizard (`/kurulum`, app/services/install_service.ts). Until it finishes, every
 * page redirects to the wizard; existing sites with an administrator count as installed.
 */
const install = {
  /** Path prefix of the wizard; the gate lets only these through before installation. */
  path: '/kurulum',
  /** Characters of the setup key printed in the server console (needed from other machines). */
  keyLength: 8,
  /** Content types created by "Temel içerik türleri" (format from config/site.ts suggestion). */
  contentTypes: ['Manga', 'Manhwa', 'Manhua', 'Webtoon', 'Novel', 'Anime'],
  /** Genres created with them (the same Turkish names the cover autofill maps to). */
  genres: [
    'Aksiyon',
    'Macera',
    'Komedi',
    'Dram',
    'Fantastik',
    'Romantizm',
    'Bilim Kurgu',
    'Gizem',
    'Korku',
    'Gerilim',
    'Doğaüstü',
    'Psikolojik',
    'Okul',
    'Spor',
    'Tarihi',
    'Dövüş Sanatları',
    'Büyü',
    'Reenkarnasyon',
    'Shounen',
    'Shoujo',
  ],
}

export default install
