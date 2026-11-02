/**
 * Reports and moderation: "Hata bildir" on chapters, "Şikâyet et" on comments and reviews, the
 * Admin → Moderasyon queue, mutes and the blocked-words filter (settings key `blocked_words`).
 */

export const reportTargets = ['chapter', 'comment', 'review'] as const
export type ReportTarget = (typeof reportTargets)[number]
export const isReportTarget = (value: unknown): value is ReportTarget =>
  typeof value === 'string' && (reportTargets as readonly string[]).includes(value)

export const reportStatuses = ['open', 'resolved', 'dismissed'] as const
export type ReportStatus = (typeof reportStatuses)[number]
export const isReportStatus = (value: unknown): value is ReportStatus =>
  typeof value === 'string' && (reportStatuses as readonly string[]).includes(value)

export interface ReportReason {
  key: string
  label: string
}

/**
 * Reasons offered in the dialog. Chapters use the set of their format (image pages, novel text
 * or video sources, see config/site.ts → contentFormats); comments and reviews share `content`.
 */
export const reportReasons: Record<'image' | 'text' | 'video' | 'content', ReportReason[]> = {
  image: [
    { key: 'missing_pages', label: 'Sayfalar eksik' },
    { key: 'page_order', label: 'Sayfa sırası yanlış' },
    { key: 'broken_images', label: 'Görseller açılmıyor' },
    { key: 'wrong_chapter', label: 'Yanlış bölüm/seri' },
    { key: 'translation', label: 'Çeviri hatası' },
    { key: 'other', label: 'Diğer' },
  ],
  text: [
    { key: 'missing_text', label: 'Metin eksik ya da yarım' },
    { key: 'formatting', label: 'Metin bozuk görünüyor' },
    { key: 'wrong_chapter', label: 'Yanlış bölüm/seri' },
    { key: 'translation', label: 'Çeviri hatası' },
    { key: 'other', label: 'Diğer' },
  ],
  video: [
    { key: 'source_down', label: 'Kaynak çalışmıyor' },
    { key: 'playback', label: 'Ses ya da görüntü sorunu' },
    { key: 'subtitles', label: 'Altyazı hatası' },
    { key: 'wrong_chapter', label: 'Yanlış bölüm/seri' },
    { key: 'other', label: 'Diğer' },
  ],
  content: [
    { key: 'spam', label: 'Spam' },
    { key: 'abuse', label: 'Hakaret / taciz' },
    { key: 'spoiler', label: 'Spoiler' },
    { key: 'inappropriate', label: 'Uygunsuz içerik' },
    { key: 'other', label: 'Diğer' },
  ],
}

/** Label of a stored reason key (any set), the key itself when it is unknown. */
export function reasonLabel(key: string) {
  for (const reasons of Object.values(reportReasons)) {
    const found = reasons.find((reason) => reason.key === key)
    if (found) return found.label
  }
  return key
}

export const reportNoteMax = 500

/** Sliding windows per reporter: guests are counted per IP address, members per account. */
export const reportLimits = {
  guest: { max: 5, windowMs: 10 * 60 * 1000 },
  member: { max: 15, windowMs: 10 * 60 * 1000 },
}

/** Mute lengths offered on the moderation page; 0 means "süresiz". */
export const muteDurations = [
  { days: 1, label: '1 gün' },
  { days: 7, label: '7 gün' },
  { days: 30, label: '30 gün' },
  { days: 0, label: 'Süresiz' },
] as const

/** `users.muted_until` of a permanent mute (a DATETIME, so it fits MySQL too). */
export const permanentMute = '9999-12-31 23:59:59'

/** Blocked words: at most this many entries of at most `blockedWordMax` characters each. */
export const blockedWordsLimit = 500
export const blockedWordMax = 60

/** Reports (groups of reports per target) per moderation page. */
export const moderationPageSize = 15

export default {
  reportReasons,
  reportNoteMax,
  reportLimits,
  muteDurations,
  permanentMute,
  moderationPageSize,
}
