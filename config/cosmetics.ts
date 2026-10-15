/**
 * Cosmetics are earned, never bought. Frames, name effects and wallpapers either use one of the
 * CSS presets below (styles live in resources/css/app.css) or an uploaded image. Name effects can
 * also be a custom gradient stored as `grad:#hex,#hex[,#hex]`.
 */
export const cosmeticKinds = {
  sticker: { label: 'Çıkartma', plural: 'Çıkartmalar', path: 'cikartmalar', equip: false },
  frame: {
    label: 'Avatar Çerçevesi',
    plural: 'Avatar Çerçeveleri',
    path: 'cerceveler',
    equip: true,
  },
  effect: { label: 'Ad Efekti', plural: 'Efektler', path: 'efektler', equip: true },
  wallpaper: {
    label: 'Duvar Kağıdı',
    plural: 'Duvar Kağıtları',
    path: 'duvar-kagitlari',
    equip: true,
  },
} as const

export type CosmeticKind = keyof typeof cosmeticKinds
export const kindNames = Object.keys(cosmeticKinds) as CosmeticKind[]
export const isKind = (value: unknown): value is CosmeticKind =>
  typeof value === 'string' && value in cosmeticKinds

export const kindByPath = (path: string) =>
  kindNames.find((kind) => cosmeticKinds[kind].path === path) ?? null

/** Preset keys selectable in the admin panel. */
export const presets: Record<Exclude<CosmeticKind, 'sticker'>, Record<string, string>> = {
  effect: {
    'zumrut': 'Zümrüt parıltı',
    'okyanus': 'Okyanus',
    'gun-batimi': 'Gün batımı',
    'sakura': 'Sakura',
    'siyah-beyaz': 'Siyah beyaz',
    'altin': 'Altın (parlayan)',
    'buz': 'Buz',
    'neon': 'Neon',
    'ates': 'Ateş (hareketli)',
    'galaksi': 'Galaksi (hareketli)',
    'gokkusagi': 'Gökkuşağı (hareketli)',
    'kraliyet': 'Kraliyet',
    'ekip': 'Ekip',
  },
  frame: {
    zumrut: 'Zümrüt halka',
    gece: 'Gece',
    gumus: 'Gümüş',
    altin: 'Altın',
    neon: 'Neon',
    buz: 'Buz kristali',
    gokkusagi: 'Gökkuşağı (dönen)',
    ates: 'Ateş (dönen)',
    sadik: 'Sadık okur',
  },
  wallpaper: {
    'gece-yarisi': 'Gece yarısı',
    'aurora': 'Aurora',
    'gun-batimi': 'Gün batımı',
    'sakura': 'Sakura',
    'derin-okyanus': 'Derin okyanus',
    'nebula': 'Nebula',
    'dijital': 'Dijital',
    'lav': 'Lav',
    'altin-saray': 'Altın saray',
  },
}

export const gradientPattern = /^grad:(#[0-9a-f]{6})(,#[0-9a-f]{6}){1,2}$/i
