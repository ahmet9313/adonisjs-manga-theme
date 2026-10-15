import type { HttpContext } from '@adonisjs/core/http'
import content from '#config/content'
import { errors } from '@vinejs/vine'
import { mkdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve, sep } from 'node:path'
import type Chapter from '#models/chapter'

export function invalidField(field: string, message: string): never {
  throw new errors.E_VALIDATION_ERROR([{ field, message, rule: 'content' }])
}

export const imageOptions = { size: '10mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] }

/** Unique names keep edits and reordered pages from overwriting existing content. */
export async function saveImage(
  file: NonNullable<ReturnType<HttpContext['request']['file']>>,
  segments: string[]
): Promise<string> {
  if (!file.isValid)
    invalidField(file.fieldName, 'Geçerli bir JPG, PNG veya WebP görseli seçin (en fazla 10 MB).')
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
