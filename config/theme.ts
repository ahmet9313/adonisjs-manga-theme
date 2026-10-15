/**
 * Everything the administrator can change under Admin → Tema. The CSS variables mirror
 * `resources/css/app.css`, where the stock values live; only changed values are stored.
 */

export type ColorGroup = 'bg' | 'text' | 'header' | 'footer' | 'panels' | 'accent'

export interface ColorToken {
  key: string
  label: string
  group: ColorGroup
  /** CSS custom property that receives the value. */
  css: string
  /** Stock value (#rrggbb or #rrggbbaa). */
  default: string
  /** Offer an opacity slider (stored as #rrggbbaa). */
  alpha?: boolean
  hint?: string
}

export const colorGroups: Record<ColorGroup, { label: string; hint: string }> = {
  bg: { label: 'Arka plan', hint: 'Sayfanın zemini, parıltılar ve noktalı desen.' },
  text: { label: 'Metin', hint: 'Başlıklar ve gövde metinleri.' },
  header: { label: 'Üst menü (header)', hint: 'Sayfanın üstündeki gezinme çubuğu.' },
  footer: { label: 'Alt bilgi (footer)', hint: 'Sayfanın en altındaki bölüm.' },
  panels: {
    label: 'Paneller ve alanlar',
    hint: 'Kartlar, cam paneller, giriş kutuları, kenarlıklar ve yönetim paneli zemini.',
  },
  accent: { label: 'Vurgu', hint: 'Düğmeler, bağlantılar, seçili öğeler ve rozetler.' },
}

export const colorTokens: ColorToken[] = [
  { key: 'bg', label: 'Sayfa arka planı', group: 'bg', css: '--t-bg', default: '#0a0f18' },
  {
    key: 'glow1',
    label: 'Sol üst parıltı',
    group: 'bg',
    css: '--t-glow-1',
    default: '#10b92121',
    alpha: true,
  },
  {
    key: 'glow2',
    label: 'Sağ üst parıltı',
    group: 'bg',
    css: '--t-glow-2',
    default: '#6366f121',
    alpha: true,
  },
  {
    key: 'glow3',
    label: 'Alt parıltı',
    group: 'bg',
    css: '--t-glow-3',
    default: '#0ea5e914',
    alpha: true,
  },
  {
    key: 'dots',
    label: 'Noktalı desen',
    group: 'bg',
    css: '--t-dots',
    default: '#ffffff09',
    alpha: true,
  },

  {
    key: 'heading',
    label: 'Başlıklar',
    group: 'text',
    css: '--t-heading',
    default: '#ffffff',
    hint: 'Başlıklar ve öne çıkan metinler.',
  },
  {
    key: 'text',
    label: 'Ana metin',
    group: 'text',
    css: '--t-text',
    default: '#e5e7eb',
    hint: 'Gövde metni ve form yazıları.',
  },
  { key: 'text2', label: 'İkincil metin', group: 'text', css: '--t-text-2', default: '#d1d5db' },
  { key: 'muted', label: 'Soluk metin', group: 'text', css: '--t-muted', default: '#9ca3af' },
  { key: 'subtle', label: 'Çok soluk metin', group: 'text', css: '--t-subtle', default: '#6b7280' },
  {
    key: 'overlay',
    label: 'Katman rengi',
    group: 'text',
    css: '--t-overlay',
    default: '#ffffff',
    hint: 'İnce çizgiler ve yarı saydam katmanlar bu renkten üretilir. Açık temada koyu yapın.',
  },

  {
    key: 'header_bg',
    label: 'Zemin',
    group: 'header',
    css: '--t-header-bg',
    default: '#0d111aeb',
    alpha: true,
  },
  {
    key: 'header_text',
    label: 'Bağlantı rengi',
    group: 'header',
    css: '--t-header-text',
    default: '#d1d5db',
  },
  {
    key: 'header_hover',
    label: 'Üzerine gelince',
    group: 'header',
    css: '--t-header-hover',
    default: '#ffffff',
  },
  {
    key: 'header_line',
    label: 'Çizgi ve katman',
    group: 'header',
    css: '--t-header-line',
    default: '#ffffff',
  },

  {
    key: 'logo1',
    label: 'Logo yazısı: başlangıç',
    group: 'header',
    css: '--t-logo-1',
    default: '#6ee7b7',
  },
  {
    key: 'logo2',
    label: 'Logo yazısı: orta',
    group: 'header',
    css: '--t-logo-2',
    default: '#5eead4',
  },
  {
    key: 'logo3',
    label: 'Logo yazısı: bitiş',
    group: 'header',
    css: '--t-logo-3',
    default: '#d9f99d',
  },
  {
    key: 'footer_bg',
    label: 'Zemin',
    group: 'footer',
    css: '--t-footer-bg',
    default: '#1118279e',
    alpha: true,
  },
  {
    key: 'footer_text',
    label: 'Metin',
    group: 'footer',
    css: '--t-footer-text',
    default: '#ffffff',
  },
  {
    key: 'footer_link',
    label: 'Bağlantı rengi',
    group: 'footer',
    css: '--t-footer-link',
    default: '#9ca3af',
  },

  {
    key: 'panel',
    label: 'Cam panel',
    group: 'panels',
    css: '--t-panel',
    default: '#1118279e',
    alpha: true,
    hint: 'Menüler, kartlar ve açılır kutular.',
  },
  {
    key: 'surface',
    label: 'Yüzey',
    group: 'panels',
    css: '--t-surface',
    default: '#161b22',
    hint: 'Yönetim paneli kartları ve yan menüsü.',
  },
  {
    key: 'surface2',
    label: 'İkinci yüzey',
    group: 'panels',
    css: '--t-surface-2',
    default: '#1c2333',
  },
  {
    key: 'field',
    label: 'Giriş alanları',
    group: 'panels',
    css: '--t-field',
    default: '#0d1117',
    hint: 'Metin kutuları ve yönetim paneli sayfa zemini.',
  },
  { key: 'border', label: 'Kenarlık', group: 'panels', css: '--t-border', default: '#374151' },
  {
    key: 'border_strong',
    label: 'Belirgin kenarlık',
    group: 'panels',
    css: '--t-border-strong',
    default: '#4b5563',
  },
  {
    key: 'hover',
    label: 'Üzerine gelme yüzeyi',
    group: 'panels',
    css: '--t-hover',
    default: '#1f2937',
  },

  {
    key: 'accent',
    label: 'Ana vurgu',
    group: 'accent',
    css: '--t-accent',
    default: '#10b981',
    hint: 'Tüm yeşil tonları bu renkten türetilir.',
  },
  {
    key: 'accent2',
    label: 'İkinci vurgu',
    group: 'accent',
    css: '--t-accent-2',
    default: '#0d9488',
    hint: 'Düğme geçişlerinin ikinci rengi.',
  },
  {
    key: 'on_accent',
    label: 'Vurgu üstü yazı',
    group: 'accent',
    css: '--t-on-accent',
    default: '#ffffff',
    hint: 'Renkli düğmelerin ve rozetlerin yazısı.',
  },
]

export const colorKeys = colorTokens.map((token) => token.key)

/** Colours whose change needs a derived palette (see `:root[data-accent]` in app.css). */
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
    label: 'Cam bulanıklığı',
    type: 'range',
    css: '--t-blur',
    min: 0,
    max: 30,
    step: 1,
    default: 14,
    unit: 'px',
    hint: 'Paneller ve menü arkasındaki bulanıklık.',
  },
  {
    key: 'scheme',
    label: 'Form ve kaydırma çubuğu şeması',
    type: 'select',
    css: 'color-scheme',
    default: 'dark',
    choices: [
      { value: 'dark', label: 'Koyu' },
      { value: 'light', label: 'Açık' },
    ],
    hint: 'Tarayıcının kendi bileşenlerinin (kaydırma çubuğu, tarih seçici) rengi.',
  },
  {
    key: 'font',
    label: 'Yazı tipi',
    type: 'select',
    css: '--t-font',
    default: 'sans',
    choices: [
      { value: 'sans', label: 'Sistem (varsayılan)' },
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
    hint: '/content/… veya https://… adresi. Boş bırakırsanız kullanılmaz.',
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

export const fontStacks: Record<string, string> = {
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

  { key: 'home_hero', label: 'Öne çıkan seri bannerı', group: 'home', default: true },
  { key: 'home_updates', label: '"Son Güncellenenler" listesi', group: 'home', default: true },
  {
    key: 'home_community',
    label: 'Son yorumlar ve öne çıkan incelemeler',
    group: 'home',
    default: true,
  },

  { key: 'series_description', label: 'Seri açıklaması', group: 'series', default: true },
  { key: 'series_sidebar', label: 'Seri bilgileri kutusu', group: 'series', default: true },
  { key: 'series_keywords', label: 'Anahtar kelimeler kutusu', group: 'series', default: true },
  { key: 'series_similar', label: '"Benzer Seriler"', group: 'series', default: true },
  { key: 'series_reviews', label: 'Puan ve incelemeler', group: 'series', default: true },
  { key: 'series_comments', label: 'Seri yorumları', group: 'series', default: true },
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

/** Colour sets applied to the form in one click; the administrator still has to save. */
export const presets: {
  key: string
  label: string
  swatch: string
  colors: Record<string, string>
  looks?: Record<string, string>
}[] = [
  { key: 'default', label: 'Varsayılan', swatch: '#10b981', colors: {} },
  {
    key: 'midnight',
    label: 'Gece Mavisi',
    swatch: '#38bdf8',
    colors: {
      bg: '#070b16',
      glow1: '#38bdf821',
      glow2: '#6366f126',
      glow3: '#0ea5e914',
      header_bg: '#0a1020eb',
      panel: '#0f172a9e',
      surface: '#0f172a',
      surface2: '#172036',
      field: '#0a1020',
      border: '#1e293b',
      border_strong: '#334155',
      hover: '#1e293b',
      logo1: '#7dd3fc',
      logo2: '#818cf8',
      logo3: '#c7d2fe',
      accent: '#38bdf8',
      accent2: '#6366f1',
    },
  },
  {
    key: 'violet',
    label: 'Mor',
    swatch: '#a78bfa',
    colors: {
      bg: '#0d0a18',
      glow1: '#a78bfa26',
      glow2: '#ec489921',
      glow3: '#8b5cf614',
      header_bg: '#120d22eb',
      panel: '#1a1330a0',
      surface: '#1a1330',
      surface2: '#241a42',
      field: '#120d22',
      border: '#2e2250',
      border_strong: '#41336e',
      hover: '#241a42',
      logo1: '#c4b5fd',
      logo2: '#f0abfc',
      logo3: '#fbcfe8',
      accent: '#a78bfa',
      accent2: '#ec4899',
    },
  },
  {
    key: 'crimson',
    label: 'Kızıl',
    swatch: '#f43f5e',
    colors: {
      bg: '#12080b',
      glow1: '#f43f5e26',
      glow2: '#f9731621',
      glow3: '#f43f5e14',
      header_bg: '#1a0b10eb',
      panel: '#2a1218a0',
      surface: '#231016',
      surface2: '#33171f',
      field: '#1a0b10',
      border: '#4a1e29',
      border_strong: '#652a39',
      hover: '#33171f',
      logo1: '#fda4af',
      logo2: '#fdba74',
      logo3: '#fde68a',
      accent: '#f43f5e',
      accent2: '#f97316',
    },
  },
  {
    key: 'light',
    label: 'Açık Tema',
    swatch: '#f3f4f6',
    looks: { scheme: 'light' },
    colors: {
      bg: '#f3f4f6',
      glow1: '#10b98122',
      glow2: '#6366f114',
      glow3: '#0ea5e90f',
      dots: '#00000010',
      heading: '#0f172a',
      text: '#1f2937',
      text2: '#374151',
      muted: '#4b5563',
      subtle: '#6b7280',
      overlay: '#000000',
      header_bg: '#ffffffeb',
      header_text: '#374151',
      header_hover: '#0f172a',
      header_line: '#000000',
      logo1: '#059669',
      logo2: '#0d9488',
      logo3: '#65a30d',
      footer_bg: '#ffffffd9',
      footer_text: '#000000',
      footer_link: '#4b5563',
      panel: '#ffffffcc',
      surface: '#ffffff',
      surface2: '#f3f4f6',
      field: '#f9fafb',
      border: '#e5e7eb',
      border_strong: '#d1d5db',
      hover: '#f3f4f6',
      accent: '#059669',
      accent2: '#0f766e',
      on_accent: '#ffffff',
    },
  },
]
