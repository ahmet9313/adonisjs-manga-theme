import settings from '#services/settings_service'
import { blockedWordMax, blockedWordsLimit } from '#config/moderation'

/** Settings key of the blocked-words list (Admin → Moderasyon). One entry per line. */
export const blockedWordsKey = 'blocked_words'

/**
 * Turkish lower case: "İ" → "i" and "I" → "ı", so "İT" and "it" match while "ıt" stays apart.
 * The combining dot some keyboards leave after "i" is dropped.
 */
export const foldTurkish = (text: string) =>
  text.normalize('NFC').toLocaleLowerCase('tr-TR').replaceAll('̇', '')

/** Clean entries from the textarea: one per line (commas also split), deduplicated. */
export function parseBlockedWords(raw: string) {
  const words = new Set<string>()
  for (const entry of raw.split(/[\n,]/)) {
    const word = foldTurkish(entry).replace(/\s+/g, ' ').trim()
    if (word && word.length <= blockedWordMax) words.add(word)
    if (words.size >= blockedWordsLimit) break
  }
  return [...words]
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Rejects comments and reviews that contain a blocked word. An entry matches at the start of
 * a word and may go on with a suffix ("aptal" also catches "aptalsın"), but never inside
 * another word ("kaptan" is fine). Spaces in an entry match any run of spaces.
 */
class WordFilterService {
  private source: string | null = null
  private pattern: RegExp | null = null

  words() {
    return parseBlockedWords(settings.get(blockedWordsKey))
  }

  private compiled() {
    const raw = settings.get(blockedWordsKey)
    if (raw !== this.source) {
      this.source = raw
      const words = parseBlockedWords(raw).sort((a, b) => b.length - a.length)
      this.pattern = words.length
        ? new RegExp(
            `(?<![\\p{L}\\p{N}])(?:${words.map((word) => escape(word).replaceAll(' ', '\\s+')).join('|')})`,
            'u'
          )
        : null
    }
    return this.pattern
  }

  /** The first blocked word found in the texts (as written in the list), or null. */
  find(...texts: (string | null | undefined)[]) {
    const pattern = this.compiled()
    if (!pattern) return null
    for (const text of texts) {
      if (!text) continue
      const match = foldTurkish(text).match(pattern)
      if (match) return match[0].replace(/\s+/g, ' ')
    }
    return null
  }

  /** Turkish error for the API, or null when the texts are clean. */
  check(kind: 'comment' | 'review', ...texts: (string | null | undefined)[]) {
    const word = this.find(...texts)
    if (!word) return null
    const what = kind === 'comment' ? 'Yorumun' : 'İncelemen'
    return `${what} izin verilmeyen bir ifade içeriyor (“${word}”). Düzenleyip tekrar dene.`
  }
}

export default new WordFilterService()
