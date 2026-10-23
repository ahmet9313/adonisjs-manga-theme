import type { HttpContext } from '@adonisjs/core/http'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve, sep } from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import yauzl, { type Entry, type ZipFile } from 'yauzl'
import adminTools from '#config/admin_tools'
import content from '#config/content'
import { imageTypeOf } from '#services/upload_service'

const limits = adminTools.bulk

/** A problem with the archive as a whole; the message is shown to staff as is. */
export class BulkUploadError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

export type ImageKind = 'jpg' | 'png' | 'webp'

/** JPG, PNG or WebP by the first bytes, whatever the file name says (null: not a page image). */
export function imageKindOf(head: Buffer): ImageKind | null {
  const ext = imageTypeOf(head)?.ext
  return ext === 'jpg' || ext === 'png' || ext === 'webp' ? ext : null
}

const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' })

/** Natural order of page names: 1, 2, 10 (not 1, 10, 2); folders before their files. */
export function naturalCompare(a: string, b: string) {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)
}

const keywordNumber =
  /(?:^|[^\p{L}])(?:b[öo]l[üu]m|chapter|chap|ch|episode|ep|bölüm)\.?\s*[#:-]?\s*(\d+(?:[.,]\d+)?)/iu
const anyNumber = /(\d+(?:[.,]\d+)?)/u

export interface ParsedName {
  number: number | null
  title: string | null
  /** "12.5": chapter numbers are whole numbers, so such folders are skipped with a warning. */
  fractional: boolean
}

/**
 * Chapter number and title from a folder (or archive) name: "12", "012", "Bölüm 12 - Başlık",
 * "Chapter 12: Title", "Vol.2 Ch.12 Title". The title is what follows the number.
 */
export function parseChapterName(name: string): ParsedName {
  const clean = name.replace(/\.zip$/i, '').trim()
  const match = keywordNumber.exec(clean) ?? anyNumber.exec(clean)
  if (!match) return { number: null, title: null, fractional: false }
  const raw = match[1]
  const after = clean.slice((match.index ?? 0) + match[0].length)
  const title =
    after
      .replace(/^[\s\-–—:._#)\]]+/u, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 255) || null
  if (/[.,]/.test(raw)) return { number: null, title, fractional: true }
  const number = Number(raw)
  if (!Number.isSafeInteger(number) || number > 1_000_000)
    return { number: null, title, fractional: false }
  return { number, title, fractional: false }
}

/** Files every OS leaves in archives: macOS resource forks, hidden files, Windows thumbnails. */
const isJunk = (segments: string[]) =>
  segments.some(
    (segment) =>
      segment === '__MACOSX' ||
      segment.startsWith('.') ||
      /^(thumbs\.db|desktop\.ini)$/i.test(segment)
  )

export interface ZipItem {
  /** Path inside the archive, `/`-separated. */
  name: string
  size: number
  /** Detected image type; null when the content is not JPG, PNG or WebP. */
  kind: ImageKind | null
}

export interface PlannedChapter {
  /** Folder path that identifies the chapter between the preview and the import ('' = flat). */
  key: string
  folder: string
  number: number | null
  title: string | null
  pages: { name: string; kind: ImageKind }[]
  size: number
  warnings: string[]
  /** False when the chapter cannot be imported as is (no number, fractional, duplicate …). */
  importable: boolean
}

export interface ZipPlan {
  /** A flat archive (images only, no folders) is one chapter whose number staff choose. */
  flat: boolean
  chapters: PlannedChapter[]
  warnings: string[]
  ignored: number
}

const maxWarnings = 30

/**
 * Turns the list of files in an archive into chapters. Pure (no I/O), so the folder rules are
 * easy to test:
 * - Junk (`__MACOSX`, hidden files, Thumbs.db) is ignored; other non-images are reported.
 * - Wrapper folders are unwrapped: `Seri/12/001.jpg` → chapter folder `12`.
 * - Images only at the top → one chapter (flat). Otherwise every top folder is a chapter and
 *   its images (also in subfolders) are its pages in natural order; loose top images are skipped.
 * - A single folder without a number counts as flat: its number comes from `fallbackNames`
 *   (unwrapped folders, the archive name) or from staff.
 */
export function planZip(items: ZipItem[], fallbackNames: string[] = []): ZipPlan {
  const warnings: string[] = []
  const warn = (message: string) => {
    if (warnings.length < maxWarnings) warnings.push(message)
    else if (warnings.length === maxWarnings) warnings.push('Diğer uyarılar gösterilmiyor.')
  }
  let ignored = 0
  let images: { segments: string[]; name: string; kind: ImageKind; size: number }[] = []
  for (const item of items) {
    const segments = item.name.split('/').filter(Boolean)
    if (!segments.length || item.name.endsWith('/')) continue
    if (isJunk(segments)) {
      ignored++
      continue
    }
    const extension = segments[segments.length - 1].split('.').pop()?.toLowerCase() || ''
    if (!limits.imageExtensions.includes(extension)) {
      warn(`${item.name}: görsel değil, atlandı.`)
      continue
    }
    if (item.size > limits.maxImageBytes) {
      warn(
        `${item.name}: ${Math.round(limits.maxImageBytes / 1024 ** 2)} MB sınırını aşıyor, atlandı.`
      )
      continue
    }
    if (!item.kind) {
      warn(`${item.name}: geçerli bir JPG, PNG veya WebP değil, atlandı.`)
      continue
    }
    images.push({ segments, name: item.name, kind: item.kind, size: item.size })
  }

  const unwrapped: string[] = []
  // Descend while the top is a single folder that itself holds folders.
  while (
    images.length &&
    images.every((image) => image.segments.length > 1) &&
    new Set(images.map((image) => image.segments[0])).size === 1 &&
    images.some((image) => image.segments.length > 2)
  ) {
    unwrapped.unshift(images[0].segments[0])
    images = images.map((image) => ({ ...image, segments: image.segments.slice(1) }))
  }

  const loose = images.filter((image) => image.segments.length === 1)
  const nested = images.filter((image) => image.segments.length > 1)
  const groups = new Map<string, typeof images>()
  if (nested.length) {
    for (const image of loose) warn(`${image.name}: klasör dışında, atlandı.`)
    for (const image of nested) {
      const key = image.segments[0]
      groups.set(key, [...(groups.get(key) ?? []), image])
    }
  } else if (loose.length) {
    groups.set('', loose)
  }

  const fallback = [...unwrapped, ...fallbackNames]
    .map((name) => parseChapterName(name))
    .find((parsed) => parsed.number !== null)
  let flat = groups.has('')
  if (!flat && groups.size === 1) {
    const [key] = groups.keys()
    if (parseChapterName(key).number === null && !parseChapterName(key).fractional) flat = true
  }

  const seen = new Map<number, string>()
  const chapters = [...groups.entries()]
    .sort(([a], [b]) => naturalCompare(a, b))
    .map(([key, list]): PlannedChapter => {
      const parsed = flat
        ? { ...(fallback ?? { number: null, title: null, fractional: false }) }
        : parseChapterName(key)
      const chapterWarnings: string[] = []
      if (parsed.fractional)
        chapterWarnings.push('Ondalıklı bölüm numarası desteklenmiyor; bu klasör atlanır.')
      else if (parsed.number === null && !flat)
        chapterWarnings.push('Klasör adında bölüm numarası bulunamadı; bu klasör atlanır.')
      if (parsed.number !== null) {
        const other = seen.get(parsed.number)
        if (other !== undefined) {
          chapterWarnings.push(
            `Bölüm ${parsed.number} “${other}” klasöründe de var; bu klasör atlanır.`
          )
        } else seen.set(parsed.number, key)
      }
      const pages = [...list]
        .sort((a, b) =>
          naturalCompare(
            a.segments.slice(1).join('/') || a.name,
            b.segments.slice(1).join('/') || b.name
          )
        )
        .map((image) => ({ name: image.name, kind: image.kind }))
      if (pages.length > limits.maxPagesPerChapter)
        chapterWarnings.push(
          `En fazla ${limits.maxPagesPerChapter} sayfa olabilir; bu klasör atlanır.`
        )
      return {
        key,
        folder: key,
        number: parsed.number,
        title: parsed.title,
        pages,
        size: list.reduce((total, image) => total + image.size, 0),
        warnings: chapterWarnings,
        importable: chapterWarnings.length === 0 && (flat || parsed.number !== null),
      }
    })
    // Shown by chapter number; folders without a usable number come last.
    .sort(
      (a, b) =>
        (a.number ?? Number.POSITIVE_INFINITY) - (b.number ?? Number.POSITIVE_INFINITY) ||
        naturalCompare(a.key, b.key)
    )
  if (chapters.length > limits.maxChapters)
    throw new BulkUploadError(
      422,
      `Arşivde ${chapters.length} bölüm var; bir seferde en fazla ${limits.maxChapters} bölüm yüklenebilir.`
    )
  if (!chapters.length)
    throw new BulkUploadError(422, 'Arşivde yüklenebilecek JPG, PNG veya WebP görseli bulunamadı.')
  return { flat, chapters, warnings, ignored }
}

/* ---------------------------------------------------------------- archive I/O */

const openZip = (path: string) =>
  new Promise<ZipFile>((done, fail) =>
    yauzl.open(
      path,
      { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: false },
      (error, zip) => (error || !zip ? fail(error) : done(zip))
    )
  )

const unsafeName = (name: string) =>
  name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').some((part) => part === '..')

/** Every entry of the archive; unsafe names (`../`, absolute paths) reject the whole archive. */
function readEntries(zip: ZipFile) {
  return new Promise<Entry[]>((done, fail) => {
    if (zip.entryCount > limits.maxEntries)
      return fail(new BulkUploadError(422, `Arşivde en fazla ${limits.maxEntries} dosya olabilir.`))
    const entries: Entry[] = []
    let total = 0
    zip.on('entry', (entry: Entry) => {
      if (unsafeName(entry.fileName))
        return fail(new BulkUploadError(422, 'Arşivde güvenli olmayan bir dosya yolu var.'))
      if (!entry.fileName.endsWith('/')) {
        total += entry.uncompressedSize
        if (total > limits.maxUncompressedBytes)
          return fail(
            new BulkUploadError(
              422,
              `Arşivin açılmış boyutu ${Math.round(limits.maxUncompressedBytes / 1024 ** 3)} GB sınırını aşıyor.`
            )
          )
      }
      entries.push(entry)
      zip.readEntry()
    })
    zip.on('end', () => done(entries))
    zip.on('error', (error: Error) =>
      fail(
        /relative path|absolute path|invalid characters/i.test(error.message)
          ? new BulkUploadError(422, 'Arşivde güvenli olmayan bir dosya yolu var.')
          : new BulkUploadError(422, 'ZIP dosyası okunamadı; bozuk olabilir.')
      )
    )
    zip.readEntry()
  })
}

const openStream = (zip: ZipFile, entry: Entry) =>
  new Promise<Readable>((done, fail) =>
    zip.openReadStream(entry, (error, stream) => (error || !stream ? fail(error) : done(stream)))
  )

/** First bytes of an entry (enough for the signature), without inflating the rest. */
async function headOf(zip: ZipFile, entry: Entry): Promise<Buffer> {
  if (entry.isEncrypted() || !entry.canDecodeFileData()) return Buffer.alloc(0)
  const stream = await openStream(zip, entry)
  return new Promise((done) => {
    let head = Buffer.alloc(0)
    const finish = () => {
      stream.removeAllListeners('data')
      stream.destroy()
      done(head)
    }
    stream.on('data', (chunk: Buffer) => {
      head = Buffer.concat([head, chunk])
      if (head.length >= 12) finish()
    })
    stream.on('end', () => done(head))
    stream.on('error', () => done(Buffer.alloc(0)))
  })
}

const isImageName = (name: string) =>
  limits.imageExtensions.includes(name.split('.').pop()?.toLowerCase() || '')

interface OpenedPlan {
  zip: ZipFile
  plan: ZipPlan
  entries: Map<string, Entry>
}

async function openPlan(path: string, fallbackNames: string[]): Promise<OpenedPlan> {
  let zip: ZipFile
  try {
    zip = await openZip(path)
  } catch {
    throw new BulkUploadError(422, 'ZIP dosyası okunamadı; bozuk olabilir.')
  }
  try {
    const entries = await readEntries(zip)
    const items: ZipItem[] = []
    for (const entry of entries) {
      if (entry.fileName.endsWith('/')) continue
      const segments = entry.fileName.split('/')
      const candidate =
        !isJunk(segments) &&
        isImageName(entry.fileName) &&
        entry.uncompressedSize <= limits.maxImageBytes
      items.push({
        name: entry.fileName,
        size: entry.uncompressedSize,
        kind: candidate ? imageKindOf(await headOf(zip, entry)) : null,
      })
    }
    return {
      zip,
      plan: planZip(items, fallbackNames),
      entries: new Map(entries.map((entry) => [entry.fileName, entry])),
    }
  } catch (error) {
    zip.close()
    throw error
  }
}

/** Reads the archive and returns its chapters for the preview. */
export async function analyzeZip(path: string, fallbackNames: string[] = []): Promise<ZipPlan> {
  const { zip, plan } = await openPlan(path, fallbackNames)
  zip.close()
  return plan
}

/**
 * Writes the pages of the chosen chapters under `<content root>/<segments(number)>/<uuid>.<ext>`
 * and returns their public paths by chapter key. Every byte is checked again while it streams
 * (signature, size); on any error the files written so far are removed and the error is thrown.
 */
export async function extractChapters(
  path: string,
  fallbackNames: string[],
  chosen: { key: string; segments: string[] }[]
): Promise<{ plan: ZipPlan; pages: Map<string, string[]> }> {
  const { zip, plan, entries } = await openPlan(path, fallbackNames)
  const written: string[] = []
  const pages = new Map<string, string[]>()
  try {
    for (const { key, segments } of chosen) {
      const chapter = plan.chapters.find((item) => item.key === key)
      if (!chapter) throw new BulkUploadError(422, 'Önizlemedeki bir bölüm arşivde bulunamadı.')
      if (chapter.pages.length > limits.maxPagesPerChapter)
        throw new BulkUploadError(
          422,
          `“${chapter.folder}” klasöründe ${limits.maxPagesPerChapter} sayfadan fazla görsel var.`
        )
      if (
        segments.some(
          (segment) => !segment || segment === '.' || segment === '..' || /[/\\]/.test(segment)
        )
      )
        throw new BulkUploadError(422, 'Geçersiz içerik yolu.')
      const directory = resolve(content.root, ...segments)
      if (!directory.startsWith(content.root + sep))
        throw new BulkUploadError(422, 'Geçersiz içerik yolu.')
      await mkdir(directory, { recursive: true })
      const list: string[] = []
      for (const page of chapter.pages) {
        const entry = entries.get(page.name)!
        const name = `${randomUUID()}.${page.kind}`
        const target = join(directory, name)
        written.push(target)
        await pipeline(
          await openStream(zip, entry),
          pageGuard(page.name),
          createWriteStream(target, { flags: 'wx' })
        )
        list.push(`/content/${segments.join('/')}/${name}`)
      }
      pages.set(key, list)
    }
    return { plan, pages }
  } catch (error) {
    await Promise.all(written.map((file) => rm(file, { force: true })))
    throw error instanceof BulkUploadError
      ? error
      : new BulkUploadError(422, 'Arşivdeki bir görsel açılamadı; ZIP bozuk olabilir.')
  } finally {
    zip.close()
  }
}

/** Passes a page through while checking its size and signature once more. */
function pageGuard(name: string) {
  let size = 0
  let head: Buffer | null = Buffer.alloc(0)
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length
      if (size > limits.maxImageBytes)
        return callback(new BulkUploadError(422, `${name}: görsel çok büyük.`))
      if (head) {
        head = Buffer.concat([head, chunk])
        if (head.length >= 12) {
          if (!imageKindOf(head))
            return callback(new BulkUploadError(422, `${name}: görsel değil.`))
          head = null
        }
      }
      callback(null, chunk)
    },
    flush(callback) {
      if (head && !imageKindOf(head))
        return callback(new BulkUploadError(422, `${name}: görsel değil.`))
      callback()
    },
  })
}

/* ---------------------------------------------------------------- temporary archives */

const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Archive of one staff member's preview: `<temp>/<user id>-<token>.zip`. */
export function archivePath(userId: number, token: unknown): string | null {
  if (typeof token !== 'string' || !tokenPattern.test(token)) return null
  return join(limits.tempDir, `${userId}-${token}.zip`)
}

/** Takes the archive for an import so a second request for the same token cannot run. */
export async function claimArchive(path: string): Promise<string | null> {
  const claimed = `${path}.${randomUUID()}.importing`
  try {
    await rename(path, claimed)
    return claimed
  } catch {
    return null
  }
}

export async function removeArchive(path: string | null) {
  if (path) await rm(path, { force: true })
}

/** Removes archives of previews that were never imported or cancelled. */
export async function pruneArchives() {
  const names = await readdir(limits.tempDir).catch(() => [] as string[])
  const cutoff = Date.now() - limits.tempMaxAgeMs
  for (const name of names) {
    const file = join(limits.tempDir, name)
    const info = await stat(file).catch(() => null)
    if (info && info.mtimeMs < cutoff) await rm(file, { force: true })
  }
}

const tooLarge = () =>
  new BulkUploadError(
    413,
    `ZIP dosyası en fazla ${Math.round(limits.maxZipBytes / 1024 ** 2)} MB olabilir.`
  )

/**
 * Streams the `zip` field of a multipart request (route in `processManually`, CSRF token in the
 * `X-CSRF-TOKEN` header) to the temporary folder. Returns the token and the client file name.
 */
export async function receiveArchive(
  request: HttpContext['request'],
  userId: number
): Promise<{ token: string; path: string; name: string; size: number }> {
  const declared = Number(request.header('content-length'))
  if (Number.isFinite(declared) && declared > limits.maxZipBytes + 1024 ** 2) throw tooLarge()
  if (!request.is(['multipart/form-data']) || !request.multipart)
    throw new BulkUploadError(422, 'Bir ZIP dosyası seçin.')
  await mkdir(limits.tempDir, { recursive: true })
  await pruneArchives()

  let failure: BulkUploadError | null = null
  let saved: { token: string; path: string; name: string; size: number } | null = null
  const fail = (error: BulkUploadError) => (failure ??= error)

  request.multipart.onFile('zip', { deferValidations: true }, async (part) => {
    if (failure || saved) {
      part.resume()
      return
    }
    const clientName =
      String(part.filename || 'arsiv.zip')
        .split(/[/\\]/)
        .pop() || 'arsiv.zip'
    if (!/\.zip$/i.test(clientName)) {
      request.multipart.abort(fail(new BulkUploadError(422, 'Dosya .zip uzantılı olmalı.')))
      return
    }
    const token = randomUUID()
    const target = archivePath(userId, token)!
    let size = 0
    let head: Buffer | null = Buffer.alloc(0)
    const guard = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length
        if (size > limits.maxZipBytes) return callback(fail(tooLarge()))
        if (head) {
          head = Buffer.concat([head, chunk])
          if (head.length >= 4) {
            // "PK\x03\x04": a ZIP starts with a local file header.
            if (head.readUInt32LE(0) !== 0x04034b50)
              return callback(fail(new BulkUploadError(422, 'Dosya geçerli bir ZIP arşivi değil.')))
            head = null
          }
        }
        callback(null, chunk)
      },
      flush(callback) {
        if (head)
          return callback(fail(new BulkUploadError(422, 'Dosya geçerli bir ZIP arşivi değil.')))
        callback()
      },
    })
    try {
      await pipeline(part, guard, createWriteStream(target, { flags: 'wx' }))
      saved = { token, path: target, name: clientName, size }
    } catch (error) {
      await rm(target, { force: true })
      request.multipart.abort(failure ?? error)
    }
  })

  try {
    await request.multipart.process({ limit: limits.maxZipBytes + 1024 ** 2 })
  } catch (error) {
    if (saved) await removeArchive((saved as { path: string }).path)
    if (failure) throw failure
    if ((error as { status?: number }).status === 413) throw tooLarge()
    throw error
  }
  if (failure) {
    if (saved) await removeArchive((saved as { path: string }).path)
    throw failure
  }
  if (!saved) throw new BulkUploadError(422, 'Bir ZIP dosyası seçin.')
  return saved
}
