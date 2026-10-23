import type { HttpContext } from '@adonisjs/core/http'
import content from '#config/content'
import { errors } from '@vinejs/vine'
import { mkdir, open, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve, sep } from 'node:path'
import type Chapter from '#models/chapter'
import db from '@adonisjs/lucid/services/db'

export function invalidField(field: string, message: string): never {
  throw new errors.E_VALIDATION_ERROR([{ field, message, rule: 'content' }])
}

export const imageOptions = { size: '10mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] }

/** Image formats recognised by their first bytes (the extension alone proves nothing). */
export const imageSignatures: {
  type: string
  ext: string
  extnames: string[]
  test: (bytes: Uint8Array) => boolean
}[] = [
  {
    type: 'image/jpeg',
    ext: 'jpg',
    extnames: ['jpg', 'jpeg'],
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    type: 'image/png',
    ext: 'png',
    extnames: ['png'],
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    type: 'image/webp',
    ext: 'webp',
    extnames: ['webp'],
    test: (b) =>
      String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' &&
      String.fromCharCode(...b.subarray(8, 12)) === 'WEBP',
  },
  {
    type: 'image/gif',
    ext: 'gif',
    extnames: ['gif'],
    test: (b) => String.fromCharCode(...b.subarray(0, 4)) === 'GIF8',
  },
  {
    type: 'image/x-icon',
    ext: 'ico',
    extnames: ['ico'],
    test: (b) => b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0,
  },
]

export function imageTypeOf(bytes: Uint8Array) {
  return imageSignatures.find((entry) => entry.test(bytes)) || null
}

/** True when the uploaded file's first bytes match its extension. */
async function contentMatches(path: string, extname: string) {
  const handle = await open(path, 'r')
  try {
    const head = new Uint8Array(16)
    await handle.read(head, 0, 16, 0)
    return Boolean(imageTypeOf(head)?.extnames.includes(extname.toLowerCase()))
  } finally {
    await handle.close()
  }
}

/** Unique names keep edits and reordered pages from overwriting existing content. */
export async function saveImage(
  file: NonNullable<ReturnType<HttpContext['request']['file']>>,
  segments: string[]
): Promise<string> {
  if (!file.isValid)
    invalidField(file.fieldName, 'Geçerli bir JPG, PNG veya WebP görseli seçin (en fazla 10 MB).')
  if (!file.tmpPath || !(await contentMatches(file.tmpPath, file.extname || '')))
    invalidField(file.fieldName, `${file.clientName}: dosyanın içeriği bir görsel değil.`)
  if (
    segments.some(
      (segment) => !segment || segment === '.' || segment === '..' || /[/\\]/.test(segment)
    )
  ) {
    invalidField(file.fieldName, 'Geçersiz içerik yolu.')
  }
  const root = content.root
  const directory = resolve(root, ...segments)
  if (!directory.startsWith(root + sep)) invalidField(file.fieldName, 'Geçersiz içerik yolu.')
  await mkdir(directory, { recursive: true })
  const name = `${randomUUID()}.${file.extname}`
  await file.move(directory, { name })
  if (!file.filePath || file.hasErrors) invalidField(file.fieldName, 'Görsel kaydedilemedi.')
  return `/content/${segments.join('/')}/${name}`
}

export function parsePageOrder(raw: unknown, existing: string[], newCount: number): string[] {
  if (existing.length + newCount > 500 && (raw === undefined || raw === null || raw === '')) {
    invalidField('page_order', 'En fazla 500 sayfa yüklenebilir.')
  }
  if (raw === undefined || raw === null || raw === '')
    return [...existing, ...Array<string>(newCount).fill('__new__')]
  let order: unknown
  try {
    order = JSON.parse(String(raw))
  } catch {
    invalidField('page_order', 'Sayfa sıralaması geçersiz.')
  }
  if (
    !Array.isArray(order) ||
    order.length > 500 ||
    order.some((entry) => typeof entry !== 'string')
  ) {
    invalidField('page_order', 'En fazla 500 sayfa yüklenebilir.')
  }
  const kept = order.filter((entry) => entry !== '__new__')
  if (
    kept.some((entry) => !existing.includes(entry)) ||
    new Set(kept).size !== kept.length ||
    order.filter((entry) => entry === '__new__').length !== newCount
  ) {
    invalidField('page_order', 'Sayfa listesi yüklenen dosyalarla eşleşmiyor.')
  }
  return order
}

export async function chapterContent(
  request: HttpContext['request'],
  isNovel: boolean,
  text: string | undefined,
  rawOrder: unknown,
  segments: string[],
  previous?: Chapter['content']
): Promise<Chapter['content']> {
  if (isNovel) {
    if (!text?.trim()) invalidField('text_content', 'Bölüm metni boş olamaz.')
    return { type: 'text', text }
  }
  const files = request.files('pages', imageOptions)
  if (files.some((file) => !file.isValid))
    invalidField('pages', 'Görseller JPG, PNG veya WebP olmalı ve 10 MB sınırını aşmamalı.')
  const existing = previous?.type === 'images' ? previous.pages : []
  const order = parsePageOrder(rawOrder, existing, files.length)
  if (!order.length) invalidField('pages', 'En az bir bölüm sayfası gerekli.')
  const pages: string[] = []
  let index = 0
  for (const entry of order)
    pages.push(entry === '__new__' ? await saveImage(files[index++], segments) : entry)
  return { type: 'images', pages }
}

/** Deletes a file previously stored by saveImage; paths outside the content root are ignored. */
export async function removeContentFile(publicPath: string | null | undefined) {
  if (!publicPath?.startsWith('/content/')) return
  const target = resolve(content.root, ...publicPath.slice('/content/'.length).split('/'))
  if (!target.startsWith(content.root + sep)) return
  await rm(target, { force: true })
}

/** Page images of a chapter body (none for text and video chapters). */
export function pageImages(body: Chapter['content'] | null | undefined): string[] {
  return body?.type === 'images' ? body.pages : []
}

/**
 * Deletes stored series images nobody points at any more. A card made from a series keeps the
 * cover's address (and outlives the series), and another series may share a file, so those
 * stay. Paths outside /content/ are ignored.
 */
export async function removeUnreferencedImages(paths: (string | null | undefined)[]) {
  const list = [
    ...new Set(paths.filter((path): path is string => Boolean(path?.startsWith('/content/')))),
  ]
  if (!list.length) return
  const [covers, banners, cards] = await Promise.all([
    db.from('series').whereIn('cover_image', list).select('cover_image as path'),
    db.from('series').whereIn('banner_image', list).select('banner_image as path'),
    db.from('cards').whereIn('image', list).select('image as path'),
  ])
  const used = new Set([...covers, ...banners, ...cards].map((row) => row.path as string))
  for (const path of list) if (!used.has(path)) await removeContentFile(path)
}

/** Deletes files of one chapter or comment set (unique per owner, so no reference check). */
export async function removeContentFiles(paths: (string | null | undefined)[]) {
  for (const path of new Set(paths)) await removeContentFile(path)
}
