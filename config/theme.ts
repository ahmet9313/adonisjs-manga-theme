/**
 * Everything the administrator can change under Admin → Tema. The stock values live twice:
 * here (`default` = dark scheme, `light` = light scheme) and in `resources/css/tokens.css`;
 * `tests/unit/tokens.spec.ts` keeps the two in sync. Only changed values are stored
 * (`c.<key>` for the dark scheme, `cl.<key>` for the light one).
 */

export type ColorGroup =
  | 'bg'
  | 'text'
  | 'header'
  | 'footer'
  | 'panels'
  | 'accent'
  | 'status'
  | 'badges'

export interface ColorToken {
  key: string
  label: string
  group: ColorGroup
  /** CSS custom property that receives the value. */
  css: string
  /** Stock value of the dark scheme (#rrggbb or #rrggbbaa). */
  default: string
  /** Stock value of the light scheme. */
  light: string
  /** Offer an opacity slider (stored as #rrggbbaa). */
  alpha?: boolean
  hint?: string
}

export const schemes = ['dark', 'light', 'system'] as const
export type Scheme = (typeof schemes)[number]
export const isScheme = (value: unknown): value is Scheme =>
  typeof value === 'string' && (schemes as readonly string[]).includes(value)

export const colorGroups: Record<ColorGroup, { label: string; hint: string }> = {
  bg: { label: 'Arka plan', hint: 'Sayfanın zemini, hafif parıltılar ve noktalı desen.' },
  text: { label: 'Metin', hint: 'Başlıklar ve gövde metinleri.' },
  header: { label: 'Üst menü (header)', hint: 'Sayfanın üstündeki gezinme çubuğu ve logo yazısı.' },
  footer: { label: 'Alt bilgi (footer)', hint: 'Sayfanın en altındaki bölüm.' },
  panels: {
    label: 'Yüzeyler ve alanlar',
    hint: 'Kartlar, paneller, giriş kutuları, kenarlıklar, açılır pencere arkası ve gölgeler.',
  },
  accent: { label: 'Vurgu', hint: 'Düğmeler, bağlantılar, seçili öğeler ve odak halkası.' },
  status: { label: 'Durum renkleri', hint: 'Başarı, uyarı, hata ve bilgi mesajları.' },
  badges: {
    label: 'Rozetler',
    hint: 'İçerik türü, yayın durumu ve yaş sınırı etiketleri. Kapak üstünde beyaz yazıyla kullanılır.',
  },
}

const token = (
  key: string,
  label: string,
  group: ColorGroup,
  css: string,
  dark: string,
  light: string,
  extra: Partial<Pick<ColorToken, 'alpha' | 'hint'>> = {}
): ColorToken => ({ key, label, group, css, default: dark, light, ...extra })

export const colorTokens: ColorToken[] = [
  token('bg', 'Sayfa arka planı', 'bg', '--t-bg', '#0e0e11', '#f7f6f3'),
  token('glow1', 'Sol üst parıltı', 'bg', '--t-glow-1', '#8b74ff12', '#5b3df00d', { alpha: true }),
  token('glow2', 'Sağ üst parıltı', 'bg', '--t-glow-2', '#8b74ff0a', '#5b3df008', { alpha: true }),
  token('glow3', 'Alt parıltı', 'bg', '--t-glow-3', '#8b74ff00', '#5b3df000', { alpha: true }),
  token('dots', 'Noktalı desen', 'bg', '--t-dots', '#ffffff06', '#0000000b', { alpha: true }),

  token('heading', 'Başlıklar', 'text', '--t-heading', '#f5f5f3', '#141417', {
    hint: 'Başlıklar ve öne çıkan metinler.',
  }),
  token('text', 'Ana metin', 'text', '--t-text', '#e4e4e1', '#232327', {
    hint: 'Gövde metni ve form yazıları.',
  }),
  token('text2', 'İkincil metin', 'text', '--t-text-2', '#c3c3c0', '#3f3f46'),
  token('muted', 'Soluk metin', 'text', '--t-muted', '#8f8f97', '#5f5f67', {
    hint: 'Tarih, açıklama ve etiketler. Zeminle en az 4.5:1 kontrast önerilir.',
  }),
  token('subtle', 'Çok soluk metin', 'text', '--t-subtle', '#6a6a72', '#8a8a92', {
    hint: 'Yalnız süs ve devre dışı öğeler.',
  }),
  token('overlay', 'Katman rengi', 'text', '--t-overlay', '#ffffff', '#000000', {
    hint: 'İnce çizgiler ve yarı saydam katmanlar bu renkten üretilir (koyu şemada beyaz, açıkta siyah).',
  }),

  token('header_bg', 'Zemin', 'header', '--t-header-bg', '#0e0e11', '#f7f6f3', { alpha: true }),
  token('header_text', 'Bağlantı rengi', 'header', '--t-header-text', '#c3c3c0', '#3f3f46'),
  token('header_hover', 'Üzerine gelince', 'header', '--t-header-hover', '#f5f5f3', '#141417'),
  token('header_line', 'Çizgi ve katman', 'header', '--t-header-line', '#ffffff', '#000000'),
  token('logo1', 'Logo yazısı: başlangıç', 'header', '--t-logo-1', '#f5f5f3', '#141417'),
  token('logo2', 'Logo yazısı: orta', 'header', '--t-logo-2', '#cdc2ff', '#4b2fd6'),
  token('logo3', 'Logo yazısı: bitiş', 'header', '--t-logo-3', '#8b74ff', '#5b3df0'),

  token('footer_bg', 'Zemin', 'footer', '--t-footer-bg', '#0b0b0d', '#efede7', { alpha: true }),
  token('footer_text', 'Başlık ve yazı', 'footer', '--t-footer-text', '#f5f5f3', '#141417'),
  token('footer_link', 'Bağlantı rengi', 'footer', '--t-footer-link', '#a1a1a9', '#55555d'),

  token('surface', 'Yüzey', 'panels', '--t-surface', '#16161a', '#ffffff', {
    hint: 'Kartlar, paneller, menüler ve yönetim paneli kutuları.',
  }),
  token('surface2', 'İkinci yüzey', 'panels', '--t-surface-2', '#1d1d22', '#f1efe9', {
    hint: 'Kart içindeki kutular, tablo başlıkları ve sekmeler.',
  }),
  token('panel', 'Eski cam panel', 'panels', '--t-panel', '#16161a', '#ffffff', {
    alpha: true,
    hint: 'Geçiş dönemindeki eski "cam" panellerin zemini.',
  }),
  token('field', 'Giriş alanları', 'panels', '--t-field', '#121215', '#ffffff'),
  token('border', 'Kenarlık', 'panels', '--t-border', '#2a2a31', '#e4e1da'),
  token('border_strong', 'Belirgin kenarlık', 'panels', '--t-border-strong', '#3a3a43', '#cfcbc2'),
  token('hover', 'Üzerine gelme yüzeyi', 'panels', '--t-hover', '#222228', '#ebe8e1'),
  token('scrim', 'Açılır pencere arkası', 'panels', '--t-scrim', '#00000099', '#14141766', {
    alpha: true,
  }),
  token('shadow_color', 'Gölge rengi', 'panels', '--t-shadow-color', '#00000073', '#1414171f', {
    alpha: true,
  }),

  token('accent', 'Ana vurgu', 'accent', '--t-accent', '#8b74ff', '#5b3df0', {
    hint: 'Odak halkası, ikonlar, seçili kenarlıklar ve ilerleme çubukları.',
  }),
  token('accent_strong', 'Dolgu vurgusu', 'accent', '--t-accent-strong', '#6d4aff', '#5b3df0', {
    hint: 'Birincil düğmeler ve seçili sayfa numarası. Üstündeki yazıyla 4.5:1 kontrast önerilir.',
  }),
  token('accent_text', 'Vurgu yazısı', 'accent', '--t-accent-text', '#b4a3ff', '#4b2fd6', {
    hint: 'Bağlantılar ve seçili sekmeler.',
  }),
  token('accent2', 'İkinci vurgu', 'accent', '--t-accent-2', '#6d4aff', '#4b2fd6', {
    hint: 'Eski renk geçişli düğmelerin ikinci rengi.',
  }),
  token('on_accent', 'Vurgu üstü yazı', 'accent', '--t-on-accent', '#ffffff', '#ffffff', {
    hint: 'Dolgu vurgulu düğmelerin ve rozetlerin yazısı.',
  }),

  token('success', 'Başarı', 'status', '--t-success', '#34d399', '#166534'),
  token('warning', 'Uyarı', 'status', '--t-warning', '#fbbf24', '#92400e'),
  token('danger', 'Hata ve silme', 'status', '--t-danger', '#f87171', '#b91c1c'),
  token('info', 'Bilgi', 'status', '--t-info', '#60a5fa', '#1d4ed8'),

  token('badge_manga', 'Manga', 'badges', '--t-badge-manga', '#2563eb', '#2563eb'),
  token('badge_manhwa', 'Manhwa', 'badges', '--t-badge-manhwa', '#15803d', '#15803d'),
  token('badge_manhua', 'Manhua', 'badges', '--t-badge-manhua', '#dc2626', '#dc2626'),
  token('badge_novel', 'Novel', 'badges', '--t-badge-novel', '#7c3aed', '#7c3aed'),
  token('badge_webtoon', 'Webtoon', 'badges', '--t-badge-webtoon', '#c2410c', '#c2410c'),
  token('badge_anime', 'Anime', 'badges', '--t-badge-anime', '#db2777', '#db2777'),
  token('badge_ongoing', 'Devam ediyor', 'badges', '--t-badge-ongoing', '#15803d', '#15803d'),
  token('badge_completed', 'Tamamlandı', 'badges', '--t-badge-completed', '#2563eb', '#2563eb'),
  token('badge_dropped', 'Bırakıldı', 'badges', '--t-badge-dropped', '#52525b', '#52525b'),
  token('badge_age18', '18+', 'badges', '--t-badge-age18', '#dc2626', '#dc2626'),
  token('badge_age16', '16+', 'badges', '--t-badge-age16', '#c2410c', '#c2410c'),
  token('badge_age13', '13+', 'badges', '--t-badge-age13', '#a16207', '#a16207'),
  token('badge_age7', '7+', 'badges', '--t-badge-age7', '#2563eb', '#2563eb'),
]

/** Colours whose change is marked on <html> (`data-accent`, `data-accent2`). */
export const derivedAccents: Record<string, string> = {
  accent: 'data-accent',
  accent2: 'data-accent2',
}

/* ---- Layout and appearance ------------------------------------------------------------- */

export interface RangeOption {
  key: string
  label: string
  type: 'range'
  css: string
  min: number
  max: number
  step: number
  default: number
  /** Formats the number for CSS, e.g. `14px`. */
  unit: string
  hint?: string
}
export interface SelectOption {
  key: string
  label: string
  type: 'select'
  /** CSS custom property; empty when the option is not a CSS value (default scheme). */
  css: string
  default: string
  choices: { value: string; label: string }[]
  hint?: string
}
export interface TextOption {
  key: string
  label: string
  type: 'url'
  default: ''
  hint?: string
}

export const looks: (RangeOption | SelectOption | TextOption)[] = [
  {
    key: 'default_scheme',
    label: 'Varsayılan renk şeması',
    type: 'select',
    css: '',
    default: 'dark',
    choices: [
      { value: 'dark', label: 'Koyu' },
      { value: 'light', label: 'Açık' },
      { value: 'system', label: 'Sistem (cihazın ayarına göre)' },
    ],
    hint: 'Ziyaretçi menüden bir şema seçmediyse kullanılır.',
  },
  {
    key: 'container',
    label: 'İçerik genişliği',
    type: 'select',
    css: '--t-container',
    default: '80rem',
    choices: [
      { value: '64rem', label: 'Dar' },
      { value: '72rem', label: 'Orta' },
      { value: '80rem', label: 'Varsayılan' },
      { value: '90rem', label: 'Geniş' },
      { value: '100%', label: 'Tam genişlik' },
    ],
  },
  {
    key: 'radius',
    label: 'Köşe yuvarlaklığı',
    type: 'range',
    css: '--t-radius',
    min: 0,
    max: 2,
    step: 0.1,
    default: 1,
    unit: '',
    hint: '0 köşeleri keskinleştirir, 2 daha yuvarlak yapar.',
  },
  {
    key: 'blur',
    label: 'Üst menü bulanıklığı',
    type: 'range',
    css: '--t-blur',
    min: 0,
    max: 30,
    step: 1,
    default: 0,
    unit: 'px',
    hint: 'Yalnız üst menü zemini yarı saydamsa görünür (Renkler → Üst menü → Zemin saydamlığı).',
  },
  {
    key: 'font',
    label: 'Yazı tipi',
    type: 'select',
    css: '--t-font',
    default: 'sans',
    choices: [
      { value: 'sans', label: 'Manrope (varsayılan)' },
      { value: 'system', label: 'Sistem yazı tipi' },
      { value: 'serif', label: 'Serif' },
      { value: 'mono', label: 'Daktilo' },
      { value: 'rounded', label: 'Yuvarlak' },
    ],
  },
  {
    key: 'font_scale',
    label: 'Yazı boyutu',
    type: 'range',
    css: '--t-font-scale',
    min: 80,
    max: 125,
    step: 1,
    default: 100,
    unit: '%',
  },
  {
    key: 'bg_image',
    label: 'Arka plan görseli',
    type: 'url',
    default: '',
    hint: 'Görsel yükleyin ya da /content/… veya https://… adresi yapıştırın. Boş bırakırsanız kullanılmaz.',
  },
  {
    key: 'bg_size',
    label: 'Görsel yerleşimi',
    type: 'select',
    css: '--t-img-size',
    default: 'cover',
    choices: [
      { value: 'cover', label: 'Kapla' },
      { value: 'contain', label: 'Sığdır' },
      { value: 'auto', label: 'Orijinal boyut' },
    ],
  },
]

/** Looks edited on the Renkler page; everything else is on Düzen ve Görünüm. */
export const colorPageLooks = ['default_scheme']

export const fontStacks: Record<string, string> = {
  /** Stock stack (also the `--t-font` default in tokens.css); never stored. */
  sans: "'Manrope Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
  system:
    "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
  rounded: "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Nunito, 'Segoe UI', sans-serif",
}

/* ---- Switches ------------------------------------------------------------------------- */

export type FlagGroup = 'header' | 'home' | 'series' | 'footer' | 'effects'

export interface Flag {
  key: string
  label: string
  group: FlagGroup
  default: boolean
  hint?: string
}

export const flagGroups: Record<FlagGroup, string> = {
  header: 'Üst menü',
  home: 'Ana sayfa',
  series: 'Seri ve okuyucu',
  footer: 'Alt bilgi',
  effects: 'Efektler',
}

export const flags: Flag[] = [
  {
    key: 'header',
    label: 'Üst menüyü göster',
    group: 'header',
    default: true,
    hint: 'Kapatırsanız giriş yapma ve hesap menüsü de kaybolur; /giris adresi çalışmaya devam eder.',
  },
  {
    key: 'header_sticky',
    label: 'Menü sayfayla birlikte kaysın',
    group: 'header',
    default: true,
    hint: 'Kapalıyken menü yukarıda sabit kalır.',
  },
  { key: 'logo_text', label: 'Site adı yazısı', group: 'header', default: true },
  { key: 'nav_home', label: '"Ana Sayfa" bağlantısı', group: 'header', default: true },
  { key: 'nav_series', label: '"Seri Listesi" bağlantısı', group: 'header', default: true },
  { key: 'nav_recommend', label: '"Öneriler" bağlantısı', group: 'header', default: true },
  { key: 'nav_bookmarks', label: '"Kaydedilenler" bağlantısı', group: 'header', default: true },
  { key: 'search', label: 'Arama kutusu', group: 'header', default: true },
  { key: 'bell', label: 'Bildirim zili', group: 'header', default: true },
  {
    key: 'scheme_switch',
    label: 'Ziyaretçi renk şemasını seçebilsin (Koyu / Açık / Sistem)',
    group: 'header',
    default: true,
    hint: 'Kapalıyken herkes Renkler sayfasındaki varsayılan şemayı görür.',
  },

  { key: 'home_hero', label: 'Öne çıkan seri bannerı', group: 'home', default: true },
  { key: 'home_updates', label: '"Son Güncellenenler" listesi', group: 'home', default: true },
  { key: 'home_popular', label: '"Popüler Seriler" şeridi', group: 'home', default: true },
  { key: 'home_genres', label: '"Türlere Göre Keşfet"', group: 'home', default: true },
  {
    key: 'home_community',
    label: 'Son yorumlar ve öne çıkan incelemeler',
    group: 'home',
    default: true,
  },
  { key: 'home_readers', label: '"Ayın Okurları"', group: 'home', default: true },
  { key: 'home_completed', label: '"Tamamlanan Seriler"', group: 'home', default: true },

  { key: 'series_description', label: 'Seri açıklaması', group: 'series', default: true },
  { key: 'series_sidebar', label: 'Seri bilgileri kutusu', group: 'series', default: true },
  { key: 'series_keywords', label: 'Anahtar kelimeler kutusu', group: 'series', default: true },
  { key: 'series_similar', label: '"Benzer Seriler"', group: 'series', default: true },
  { key: 'series_reviews', label: 'Puan ve incelemeler', group: 'series', default: true },
  { key: 'series_comments', label: 'Seri yorumları', group: 'series', default: true },
  {
    key: 'reader_toolbar',
    label: 'Okuyucu araç çubuğu (bölüm seçici, okuma ayarları)',
    group: 'series',
    default: true,
  },
  { key: 'reader_comments', label: 'Bölüm okuyucusunda yorumlar', group: 'series', default: true },

  { key: 'footer', label: 'Alt bilgiyi göster', group: 'footer', default: true },
  { key: 'footer_social', label: 'Sosyal bağlantılar', group: 'footer', default: true },
  { key: 'footer_description', label: 'Site açıklaması', group: 'footer', default: true },

  { key: 'bg_glow', label: 'Arka plan parıltıları', group: 'effects', default: true },
  { key: 'bg_dots', label: 'Noktalı desen', group: 'effects', default: true },
  {
    key: 'bg_fixed',
    label: 'Arka plan sabit kalsın',
    group: 'effects',
    default: true,
    hint: 'Kapalıyken arka plan sayfayla birlikte kayar.',
  },
  { key: 'animations', label: 'Animasyonlar ve geçişler', group: 'effects', default: true },
  {
    key: 'admin_themed',
    label: 'Temayı yönetim paneline uygula',
    group: 'effects',
    default: true,
    hint: 'Panel okunmaz olursa adresin sonuna ?guvenli=1 ekleyerek temasız açın.',
  },
]

/* ---- Presets -------------------------------------------------------------------------- */

export interface Preset {
  key: string
  label: string
  /** The scheme whose colours the preset fills in. */
  scheme: 'dark' | 'light'
  swatch: string
  /** Changed colours; every other colour of that scheme returns to its stock value. */
  colors: Record<string, string>
}

/** Colour sets applied to the form in one click; the administrator still has to save. */
export const presets: Preset[] = [
  { key: 'ink', label: 'Mürekkep', scheme: 'dark', swatch: '#8b74ff', colors: {} },
  {
    key: 'midnight',
    label: 'Gece Mavisi',
    scheme: 'dark',
    swatch: '#38bdf8',
    colors: {
      bg: '#0a0e17',
      glow1: '#38bdf812',
      glow2: '#6366f10d',
      header_bg: '#0a0e17',
      logo2: '#bae6fd',
      logo3: '#38bdf8',
      footer_bg: '#080b12',
      surface: '#111827',
      surface2: '#172033',
      panel: '#111827',
      field: '#0c111c',
      border: '#1f2937',
      border_strong: '#334155',
      hover: '#1a2333',
      accent: '#38bdf8',
      accent_strong: '#0369a1',
      accent_text: '#7dd3fc',
      accent2: '#6366f1',
      muted: '#9aa4b2',
    },
  },
  {
    key: 'emerald',
    label: 'Zümrüt',
    scheme: 'dark',
    swatch: '#10b981',
    colors: {
      bg: '#0b0f0e',
      glow1: '#10b98112',
      glow2: '#14b8a60a',
      header_bg: '#0b0f0e',
      logo2: '#a7f3d0',
      logo3: '#10b981',
      surface: '#121816',
      surface2: '#18201d',
      panel: '#121816',
      field: '#0e1311',
      border: '#25302c',
      border_strong: '#34423d',
      hover: '#1c2522',
      accent: '#10b981',
      accent_strong: '#047857',
      accent_text: '#6ee7b7',
      accent2: '#0d9488',
      muted: '#97a29d',
    },
  },
  {
    key: 'crimson',
    label: 'Kızıl',
    scheme: 'dark',
    swatch: '#f43f5e',
    colors: {
      bg: '#110a0c',
      glow1: '#f43f5e12',
      glow2: '#f973160a',
      header_bg: '#110a0c',
      logo2: '#fecdd3',
      logo3: '#f43f5e',
      footer_bg: '#0d0709',
      surface: '#1a1013',
      surface2: '#22151a',
      panel: '#1a1013',
      field: '#140c0f',
      border: '#35202a',
      border_strong: '#4a2a37',
      hover: '#2a1a20',
      accent: '#f43f5e',
      accent_strong: '#be123c',
      accent_text: '#fda4af',
      accent2: '#f97316',
    },
  },
  { key: 'paper', label: 'Kâğıt', scheme: 'light', swatch: '#f7f6f3', colors: {} },
  {
    key: 'cream',
    label: 'Krem',
    scheme: 'light',
    swatch: '#f5efe4',
    colors: {
      bg: '#f5efe4',
      dots: '#3b2a1010',
      header_bg: '#f5efe4',
      footer_bg: '#ece3d3',
      heading: '#1c1813',
      text: '#2a241c',
      text2: '#4a4033',
      muted: '#645849',
      subtle: '#9a8e7d',
      surface: '#fffaf2',
      surface2: '#efe6d6',
      panel: '#fffaf2',
      field: '#fffdf8',
      border: '#e3d7c3',
      border_strong: '#cdbfa6',
      hover: '#ece2cf',
      success: '#126b33',
      warning: '#9a4507',
    },
  },
  {
    key: 'snow',
    label: 'Kar',
    scheme: 'light',
    swatch: '#2563eb',
    colors: {
      bg: '#f6f7f9',
      dots: '#0f172a0a',
      header_bg: '#ffffff',
      footer_bg: '#eef0f4',
      heading: '#0f172a',
      text: '#1e293b',
      text2: '#334155',
      muted: '#5b6576',
      surface: '#ffffff',
      surface2: '#eef1f5',
      panel: '#ffffff',
      border: '#e2e6ec',
      border_strong: '#cbd2dc',
      hover: '#e9edf2',
      accent: '#2563eb',
      accent_strong: '#1d4ed8',
      accent_text: '#1d4ed8',
      accent2: '#1e40af',
      logo2: '#1d4ed8',
      logo3: '#2563eb',
    },
  },
]
