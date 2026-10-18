import watch, { type VideoSource } from '#config/watch'
import content from '#config/content'
import Chapter from '#models/chapter'
import { invalidField, removeContentFile } from '#services/upload_service'
import type { EpisodeVideo } from '#services/series_presenter'
import type { HttpContext } from '@adonisjs/core/http'
import { createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, extname, join, resolve, sep } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/** Longest accepted source address (after extracting it from pasted iframe code). */
export const MAX_LINK_LENGTH = 2048

/** A pasted link that cannot be used as a source; the message is shown to staff as is. */
export class VideoLinkError extends Error {}

export interface NormalizedLink {
  url: string
  kind: 'embed' | 'file'
  /** Display name derived from the address, e.g. "YouTube" or "player.example.com". */
  host: string
}

/** Display names of well-known video sites, matched against the hostname and its parents. */
const knownHosts: [string, string][] = [
  ['youtube.com', 'YouTube'],
  ['youtube-nocookie.com', 'YouTube'],
  ['youtu.be', 'YouTube'],
  ['drive.google.com', 'Google Drive'],
  ['dailymotion.com', 'Dailymotion'],
  ['dai.ly', 'Dailymotion'],
  ['ok.ru', 'Odnoklassniki'],
  ['vimeo.com', 'Vimeo'],
  ['sibnet.ru', 'Sibnet'],
  ['vk.com', 'VK'],
  ['vk.ru', 'VK'],
  ['vkvideo.ru', 'VK'],
  ['mega.nz', 'Mega'],
  ['mega.io', 'Mega'],
  ['mail.ru', 'Mail.ru'],
  ['rutube.ru', 'Rutube'],
  ['mp4upload.com', 'Mp4upload'],
  ['streamtape.com', 'Streamtape'],
  ['uqload.com', 'Uqload'],
  ['pixeldrain.com', 'Pixeldrain'],
]

const isDomain = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith('.' + domain)

export function hostNameOf(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  for (const [domain, name] of knownHosts) if (isDomain(host, domain)) return name
  return host.replace(/^www\./, '')
}

const decodeEntities = (value: string) =>
  value
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')

/** Pasted `<iframe ... src="...">` code yields its src; anything else is returned trimmed. */
function extractAddress(raw: string): string {
  const value = raw.trim()
  if (!value.includes('<')) return value
  const match = value.match(/<iframe\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
  if (!match) throw new VideoLinkError('Yapıştırılan kodda iframe adresi (src) bulunamadı.')
  return decodeEntities((match[1] ?? match[2] ?? match[3] ?? '').trim())
}

/** Seconds from YouTube's `t`/`start` values: "90", "90s", "1m30s", "1h2m3s". */
function youtubeStart(value: string | null): number | null {
  if (!value) return null
  if (/^\d+$/.test(value)) return Number(value) || null
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!match || !match[0]) return null
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) || null
}

/** Rewrites watch-page addresses of common sites to their embeddable player address. */
function toEmbed(url: URL): string {
  const host = url.hostname.toLowerCase()
  const path = url.pathname
  const youtubeId = /^[\w-]{11}$/

  if (
    isDomain(host, 'youtube.com') ||
    isDomain(host, 'youtube-nocookie.com') ||
    host === 'youtu.be'
  ) {
    let id: string | null = null
    if (host === 'youtu.be') id = path.split('/')[1] || null
    else if (path === '/watch') id = url.searchParams.get('v')
    else id = path.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1] || null
    if (id && youtubeId.test(id)) {
      const start = youtubeStart(url.searchParams.get('t') || url.searchParams.get('start'))
      return `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`
    }
    return url.href
  }

  if (host === 'drive.google.com') {
    const id =
      path.match(/^\/file\/d\/([\w-]+)/)?.[1] ||
      (path === '/open' || path === '/uc' ? url.searchParams.get('id') : null)
    if (id && /^[\w-]+$/.test(id)) return `https://drive.google.com/file/d/${id}/preview`
    return url.href
  }

  if (isDomain(host, 'dailymotion.com') || host === 'dai.ly') {
    if (host === 'geo.dailymotion.com') return url.href
    const id =
      host === 'dai.ly'
        ? path.match(/^\/([a-z0-9]+)/i)?.[1]
        : path.match(/^\/(?:embed\/)?video\/([a-z0-9]+)/i)?.[1]
    if (id) return `https://geo.dailymotion.com/player.html?video=${id}`
    return url.href
  }

  if (isDomain(host, 'ok.ru')) {
    const id = path.match(/^\/(?:video|videoembed|live)\/(\d+)/)?.[1]
    if (id) return `https://ok.ru/videoembed/${id}`
    return url.href
  }

  if (isDomain(host, 'vimeo.com') && host !== 'player.vimeo.com') {
    const match = path.match(/^\/(?:video\/)?(\d+)(?:\/([0-9a-f]+))?\/?$/i)
    if (match) {
      const hash = match[2] || url.searchParams.get('h')
      return `https://player.vimeo.com/video/${match[1]}${hash ? `?h=${hash}` : ''}`
    }
    return url.href
  }

  return url.href
}

/**
 * Turns a pasted address or iframe code into a playable https source. Watch pages of common
 * sites become their embed players; .mp4/.webm/.m4v addresses are played directly.
 * Throws `VideoLinkError` with a Turkish message when the link cannot be used.
 */
export function normalizeLink(raw: unknown): NormalizedLink {
  if (typeof raw !== 'string' || !raw.trim()) throw new VideoLinkError('Bağlantı boş olamaz.')
  if (raw.length > MAX_LINK_LENGTH * 4) throw new VideoLinkError('Bağlantı çok uzun.')
  let address = extractAddress(raw)
  if (!address) throw new VideoLinkError('Bağlantı boş olamaz.')
  if (address.startsWith('//')) address = 'https:' + address
  else if (
    !/^[a-z][a-z0-9+.-]*:/i.test(address) &&
    /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(address)
  )
    address = 'https://' + address
  if (address.length > MAX_LINK_LENGTH)
    throw new VideoLinkError(`Bağlantı en fazla ${MAX_LINK_LENGTH} karakter olabilir.`)

  let url: URL
  try {
    url = new URL(address)
  } catch {
    throw new VideoLinkError('Geçerli bir https bağlantısı girin.')
  }
  if (url.protocol === 'http:')
    throw new VideoLinkError(
      'Bağlantı https ile başlamalı; http oynatıcılar https sitelerde tarayıcı tarafından engellenir.'
    )
  if (url.protocol !== 'https:' || !url.hostname)
    throw new VideoLinkError('Geçerli bir https bağlantısı girin.')
  if (url.username || url.password)
    throw new VideoLinkError('Bağlantı kullanıcı adı veya parola içeremez.')

  const href = toEmbed(url)
  if (href.length > MAX_LINK_LENGTH)
    throw new VideoLinkError(`Bağlantı en fazla ${MAX_LINK_LENGTH} karakter olabilir.`)
  const finalUrl = new URL(href)
  const extension = finalUrl.pathname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  return {
    url: href,
    kind: extension && watch.videoExtensions.includes(extension) ? 'file' : 'embed',
    host: hostNameOf(finalUrl.hostname),
  }
}

/** `/content/videos/<series id>/<uuid>.<ext>` as written by the admin upload endpoint. */
const localPattern = () =>
  new RegExp(
    `^/content/videos/(\\d+)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(?:${watch.videoExtensions.join('|')})$`
  )

/** Absolute path of an uploaded video, or null when the public path is not a local video. */
export function localVideoFile(publicPath: string): string | null {
  if (!publicPath.startsWith('/content/videos/')) return null
  const target = resolve(content.root, ...publicPath.slice('/content/'.length).split('/'))
  return target.startsWith(content.root + sep) ? target : null
}

async function fileExists(publicPath: string) {
  const target = localVideoFile(publicPath)
  if (!target) return false
  try {
    const file = await stat(target)
    return file.isFile()
  } catch {
    return false
  }
}

const textOf = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/**
 * Validates the `sources` form field: a JSON array of
 * `{ kind: 'local' | 'link', url, host?, label? }` (stored kinds `embed`/`file` are
 * accepted as `link`). Returns the sources to store; errors name the 1-based row.
 */
export async function parseSources(
  raw: unknown,
  { seriesId, previous = [] }: { seriesId: number; previous?: VideoSource[] }
): Promise<VideoSource[]> {
  if (raw === undefined || raw === null || raw === '')
    invalidField('sources', 'En az bir video kaynağı ekleyin.')
  let entries: unknown
  try {
    entries = JSON.parse(String(raw))
  } catch {
    invalidField('sources', 'Kaynak listesi okunamadı.')
  }
  if (!Array.isArray(entries)) invalidField('sources', 'Kaynak listesi okunamadı.')
  if (!entries.length) invalidField('sources', 'En az bir video kaynağı ekleyin.')
  if (entries.length > watch.maxSources)
    invalidField('sources', `Bir bölüme en fazla ${watch.maxSources} kaynak eklenebilir.`)

  const previousLocal = new Set(
    previous.filter((source) => source.kind === 'local').map((source) => source.url)
  )
  const pattern = localPattern()
  const seen = new Set<string>()
  const sources: VideoSource[] = []

  for (const [index, entry] of entries.entries()) {
    const row = `${index + 1}. kaynak`
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      invalidField('sources', `${row} geçersiz.`)
    const item = entry as Record<string, unknown>
    const label = textOf(item.label)
    if (label.length > watch.maxLabelLength)
      invalidField('sources', `${row}: etiket en fazla ${watch.maxLabelLength} karakter olabilir.`)
    const host = textOf(item.host)
    if (host.length > watch.maxNameLength)
      invalidField(
        'sources',
        `${row}: kaynak adı en fazla ${watch.maxNameLength} karakter olabilir.`
      )
    const rawUrl = typeof item.url === 'string' ? item.url : ''
    if (!rawUrl.trim()) invalidField('sources', `${row}: bağlantı veya video dosyası gerekli.`)

    let source: VideoSource
    if (item.kind === 'local') {
      const url = rawUrl.trim()
      const match = url.match(pattern)
      if (!previousLocal.has(url) && (!match || Number(match[1]) !== seriesId))
        invalidField('sources', `${row}: yüklenen video bu seriye ait değil.`)
      if (!(await fileExists(url)))
        invalidField('sources', `${row}: video dosyası bulunamadı; yeniden yükleyin.`)
      source = { host: watch.localHost, kind: 'local', url, label: label || null }
    } else if (item.kind === 'link' || item.kind === 'embed' || item.kind === 'file') {
      let link: NormalizedLink
      try {
        link = normalizeLink(rawUrl)
      } catch (error) {
        if (error instanceof VideoLinkError) invalidField('sources', `${row}: ${error.message}`)
        throw error
      }
      source = {
        host: host || link.host,
        kind: link.kind,
        url: link.url,
        label: label || null,
      }
    } else {
      invalidField('sources', `${row}: kaynak türü geçersiz.`)
    }

    if (seen.has(source.url)) invalidField('sources', `${row}: bu kaynak zaten ekli.`)
    seen.add(source.url)
    sources.push(source)
  }
  return sources
}

/** Sources of a stored episode for the watch page; uploaded videos show the current local name. */
export function episodeVideo(sources: VideoSource[]): EpisodeVideo {
  return {
    sources: sources.map((source) => ({
      host: source.kind === 'local' ? watch.localHost : source.host,
      kind: source.kind,
      url: source.url,
      label: source.label ?? null,
    })),
  }
}

/** Uploaded video paths referenced by a chapter's content. */
export function localVideoPaths(chapterContent: Chapter['content'] | null | undefined): string[] {
  if (chapterContent?.type !== 'video' || !Array.isArray(chapterContent.sources)) return []
  return chapterContent.sources
    .filter((source) => source.kind === 'local' && typeof source.url === 'string')
    .map((source) => source.url)
}

/**
 * Deletes uploaded videos that no chapter references any more. Call after the chapter rows
 * were updated or deleted; a file shared by another episode is kept.
 */
export async function removeUnusedVideos(paths: string[]) {
  for (const path of new Set(paths)) {
    if (!localVideoFile(path)) continue
    const stillUsed = await Chapter.query().whereLike('content', `%${path}%`).first()
    if (!stillUsed) await removeContentFile(path)
  }
}

/** Upload failure with the HTTP status and Turkish message sent back as `{ message }`. */
export class VideoUploadError extends Error {
  constructor(
    public status: 413 | 422,
    message: string
  ) {
    super(message)
  }
}

/** Whether the first bytes look like the container the extension promises. */
export function hasVideoSignature(head: Buffer, extension: string) {
  if (extension === 'webm') return head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3
  // MP4/M4V (ISO base media): a box size followed by "ftyp".
  return head.length >= 8 && head.toString('latin1', 4, 8) === 'ftyp'
}

const tooLarge = () =>
  new VideoUploadError(
    413,
    `Video en fazla ${Math.round(watch.maxUploadBytes / 1024 ** 3)} GB olabilir.`
  )

/**
 * Streams the multipart `video` field straight to disk (never buffered in memory), checking
 * the extension, the file signature and `watch.maxUploadBytes`. A partial file is removed on
 * any failure. Returns the public path, the original file name and the stored size.
 */
export async function receiveVideo(
  request: HttpContext['request'],
  seriesId: number
): Promise<{ url: string; name: string; size: number }> {
  const declared = Number(request.header('content-length'))
  // Multipart framing adds a little to the file itself.
  if (Number.isFinite(declared) && declared > watch.maxUploadBytes + 1024 ** 2) throw tooLarge()
  if (!request.is(['multipart/form-data']) || !request.multipart)
    throw new VideoUploadError(422, 'Bir video dosyası seçin.')

  const directory = resolve(content.root, 'videos', String(seriesId))
  if (!directory.startsWith(content.root + sep))
    throw new VideoUploadError(422, 'Geçersiz içerik yolu.')
  let failure: VideoUploadError | null = null
  let saved: { url: string; name: string; size: number } | null = null
  const fail = (error: VideoUploadError) => {
    failure ??= error
    return failure
  }

  request.multipart.onFile('video', { deferValidations: true }, async (part) => {
    if (failure || saved) {
      part.resume()
      return
    }
    const clientName = basename(part.filename || 'video')
    const extension = extname(clientName).slice(1).toLowerCase()
    if (!watch.videoExtensions.includes(extension)) {
      request.multipart.abort(
        fail(
          new VideoUploadError(
            422,
            `Video ${watch.videoExtensions.map((ext) => ext.toUpperCase()).join(', ')} olmalı.`
          )
        )
      )
      return
    }
    await mkdir(directory, { recursive: true })
    const name = `${randomUUID()}.${extension}`
    const target = join(directory, name)
    let size = 0
    let head: Buffer | null = Buffer.alloc(0)
    const badType = () =>
      fail(new VideoUploadError(422, 'Dosya geçerli bir video değil (MP4, WebM veya M4V).'))
    const guard = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length
        if (size > watch.maxUploadBytes) return callback(fail(tooLarge()))
        if (head) {
          head = Buffer.concat([head, chunk])
          if (head.length >= 12) {
            if (!hasVideoSignature(head, extension)) return callback(badType())
            head = null
          }
        }
        callback(null, chunk)
      },
      flush(callback) {
        if (head && !hasVideoSignature(head, extension)) return callback(badType())
        callback()
      },
    })
    try {
      await pipeline(part, guard, createWriteStream(target, { flags: 'wx' }))
      saved = { url: `/content/videos/${seriesId}/${name}`, name: clientName, size }
    } catch (error) {
      await rm(target, { force: true })
      // Stops reading the rest of the body; `process()` rejects and the caller answers.
      request.multipart.abort(failure ?? error)
    }
  })

  try {
    await request.multipart.process({ limit: watch.maxUploadBytes + 1024 ** 2 })
  } catch (error) {
    if (saved) await removeContentFile((saved as { url: string }).url)
    if (failure) throw failure
    if ((error as { status?: number }).status === 413) throw tooLarge()
    throw error
  }
  if (failure) {
    if (saved) await removeContentFile((saved as { url: string }).url)
    throw failure
  }
  if (!saved) throw new VideoUploadError(422, 'Bir video dosyası seçin.')
  return saved
}
