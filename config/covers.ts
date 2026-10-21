/**
 * "Otomatik doldur / İnternetten bul" in the admin series form: cover and banner candidates and
 * the series' details (description, titles, genres, people, year, status, age rating) from public
 * catalogue sites (app/services/cover_search_service.ts). The chosen image is downloaded through
 * this server and put into the form's image field; nothing is stored until the series is saved.
 */
const covers = {
  /**
   * Searched in parallel; a source that is down or slow only drops its own results.
   * `trust` adds to the score of its covers (AniList first: official key art and the fullest
   * details), `width` is the usual width of its full image when the source does not say.
   * `formats` limits a source to content formats (IMDb lists films and series, so it is asked
   * for video series only).
   */
  sources: {
    anilist: { label: 'AniList', site: 'https://anilist.co', trust: 9, width: 460, formats: null },
    mal: {
      label: 'MyAnimeList',
      site: 'https://myanimelist.net',
      trust: 4,
      width: 225,
      formats: null,
    },
    kitsu: { label: 'Kitsu', site: 'https://kitsu.app', trust: 3, width: 550, formats: null },
    imdb: {
      label: 'IMDb',
      site: 'https://www.imdb.com',
      trust: 4,
      width: 1000,
      formats: ['video'],
    },
  } as Record<
    string,
    { label: string; site: string; trust: number; width: number; formats: string[] | null }
  >,
  /** Images may only be downloaded from these hosts (https), never from an address typed in. */
  imageHosts: [
    's4.anilist.co',
    'cdn.myanimelist.net',
    'media.kitsu.app',
    'media.kitsu.io',
    'm.media-amazon.com',
  ],
  /** Per request; a source answering later is reported as "yanıt vermedi". */
  timeoutMs: 8000,
  /** Same limit as the cover upload (upload_service imageOptions). */
  maxImageBytes: 10 * 1024 * 1024,
  /** Search results are kept this long per process so repeated searches spare the sites. */
  cacheMinutes: 30,
  /** Searches, detail lookups and image downloads per staff member and minute. */
  searchesPerMinute: 20,
  detailsPerMinute: 30,
  imagesPerMinute: 150,
  /** Longest search text and how many alternative titles are tried when the title finds nothing. */
  maxQueryLength: 120,
  maxAlternatives: 2,
  userAgent: 'Mozilla/5.0 (compatible; MangaHub/0.10; kapak arama)',
  /**
   * Genre names of the sources (English) → this site's genres. A genre is matched by its own
   * name too, so "Seinen" or "Slice of Life" need no entry. Unmatched genres are offered, not
   * created.
   */
  genres: {
    'Action': 'Aksiyon',
    'Adventure': 'Macera',
    'Comedy': 'Komedi',
    'Drama': 'Dram',
    'Fantasy': 'Fantastik',
    'Horror': 'Korku',
    'Mystery': 'Gizem',
    'Psychological': 'Psikolojik',
    'Romance': 'Romantizm',
    'Sci-Fi': 'Bilim Kurgu',
    'Science Fiction': 'Bilim Kurgu',
    'Supernatural': 'Doğaüstü',
    'Thriller': 'Gerilim',
    'Suspense': 'Gerilim',
    'Sports': 'Spor',
    'Martial Arts': 'Dövüş Sanatları',
    'Mythology': 'Mitoloji',
    'School': 'Okul',
    'School Life': 'Okul',
    'Video Game': 'Oyun',
    'Game': 'Oyun',
    'Parody': 'Parodi',
    'Reincarnation': 'Reenkarnasyon',
    'Historical': 'Tarihi',
    'Family': 'Aile',
    'Shonen': 'Shounen',
    'Shoujo': 'Shoujo',
    'Shojo': 'Shoujo',
    'Girls Love': 'Girls Love',
    'Boys Love': 'Boys Love',
    'Music': 'Müzik',
    'Military': 'Askeri',
    'Magic': 'Büyü',
    'Vampire': 'Vampir',
    'Time Travel': 'Zaman Yolculuğu',
    'Survival': 'Hayatta Kalma',
    'Gourmet': 'Yemek',
    'Cooking': 'Yemek',
    'Medical': 'Tıp',
    'Detective': 'Dedektif',
    'Crime': 'Suç',
    'Space': 'Uzay',
  } as Record<string, string>,
}

export type CoverSource = 'anilist' | 'mal' | 'kitsu' | 'imdb'

export default covers
