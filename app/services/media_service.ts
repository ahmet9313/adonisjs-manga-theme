/**
 * Files under the content root (`/content/*`): images with week-long caching and ETags, SVGs
 * sandboxed, videos with byte ranges, and resized WebP variants of images (`?w=`). Used by the
 * session-free content_middleware and the fallback `/content/*` route (media_controller).
 */
import type { HttpContext } from '@adonisjs/core/http'
import content from '#config/content'
import { cacheLifetimes, svgHeaders } from '#config/static'
import { dirname, join, resolve, sep, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { createReadStream, type Stats } from 'node:fs'
import { Readable } from 'node:stream'

// .ico: the tab icon can be uploaded under Tema → Genel.
const images = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.ico']
/** Uploaded episode videos (config/watch.ts), streamed with HTTP range support. */
const videos: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
}

/**
 * Parses a single `bytes=` range. Returns null when the header should be ignored (absent,
 * malformed or several ranges: the whole file is sent) and 'unsatisfiable' for a 416.
 */
export function parseRange(
  header: string | undefined,
  size: number
): { start: number; end: number } | 'unsatisfiable' | null {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/i)
  if (!match || (!match[1] && !match[2])) return null
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!suffix || !size) return 'unsatisfiable'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  if (start >= size) return 'unsatisfiable'
  if (end < start) return null
  return { start, end }
}

/** Streams a video with `Accept-Ranges`, 206 partial responses, 416 and HEAD support. */
function serveVideo({ request, response }: HttpContext, path: string, file: Stats) {
  const etag = `W/"${file.size.toString(16)}-${Math.floor(file.mtimeMs).toString(16)}"`
  response.header('Accept-Ranges', 'bytes')
  response.header('Last-Modified', file.mtime.toUTCString())
  response.header('ETag', etag)

  const ifRange = request.header('if-range')
  const range =
    ifRange && ifRange !== etag && ifRange !== file.mtime.toUTCString()
      ? null
      : parseRange(request.header('range'), file.size)
  if (range === 'unsatisfiable') {
    response.header('Content-Range', `bytes */${file.size}`)
    return response.status(416).send({ message: 'İstenen aralık dosyada yok.' })
  }
  if (!range && request.header('if-none-match') === etag) return response.status(304).send(null)
  response.header('Content-Type', videos[extname(path).toLowerCase()])

  const start = range ? range.start : 0
  const end = range ? range.end : file.size - 1
  if (range) {
    response.status(206)
    response.header('Content-Range', `bytes ${start}-${end}/${file.size}`)
  }
  response.header('Content-Length', String(Math.max(0, end - start + 1)))
  if (request.method() === 'HEAD' || !file.size) return response.stream(Readable.from([]))
  return response.stream(createReadStream(path, { start, end }))
}

/* ------------------------------------------------------------------ variants */

/**
 * Smaller WebP copies of stored images for cards, lists and thumbnails: `/content/<path>?w=320`.
 * Made on first request with sharp and kept under `<content root>/_variants/w<width>/` (made
 * again when the original changes). The widths are fixed so a URL cannot make the server
 * produce endless sizes; anything else, GIFs (animation) and SVGs get the original. If sharp
 * cannot load on a machine, the original is served.
 */
export const variantWidths = [160, 320, 640, 1280]
const resizable = ['.jpg', '.jpeg', '.png', '.webp']
const VARIANTS = '_variants'
const working = new Map<string, Promise<string | null>>()
let sharpModule: Promise<typeof import('sharp') | null> | null = null

function loadSharp() {
  sharpModule ??= import('sharp').then(
    (module) => module.default,
    () => null
  )
  return sharpModule
}

async function variantOf(path: string, segments: string[], source: Stats, width: number) {
  if (segments[0] === VARIANTS) return null
  const target = join(content.root, VARIANTS, `w${width}`, ...segments) + '.webp'
  try {
    const cached = await stat(target)
    if (cached.mtimeMs >= source.mtimeMs) return target
  } catch {}
  let job = working.get(target)
  if (!job) {
    job = makeVariant(path, target, width).finally(() => working.delete(target))
    working.set(target, job)
  }
  return job
}

async function makeVariant(path: string, target: string, width: number) {
  const sharp = await loadSharp()
  if (!sharp) return null
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    await mkdir(dirname(target), { recursive: true })
    await sharp(path, { failOn: 'none' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 74, effort: 4 })
      .toFile(temporary)
    await rename(temporary, target)
    return target
  } catch {
    await rm(temporary, { force: true })
    return null
  }
}

/** `src` and `srcset` for a stored image (other addresses are returned unchanged). */
export function variantUrl(src: string | null | undefined, width: number) {
  if (!src || !src.startsWith('/content/') || !resizable.includes(extname(src).toLowerCase()))
    return src || ''
  return `${src}?w=${width}`
}

export function variantSrcset(src: string | null | undefined, widths: number[]) {
  if (!src || !src.startsWith('/content/') || !resizable.includes(extname(src).toLowerCase()))
    return ''
  return widths.map((width) => `${src}?w=${width} ${width}w`).join(', ')
}

/**
 * Streams one file from the content root. Shared by the session-free `content_middleware`
 * (normal path) and the `/content/*` route (fallback).
 */
export async function serveContent(ctx: HttpContext, segments: string[]) {
  const { response } = ctx
  const path = resolve(content.root, ...segments)
  const extension = extname(path).toLowerCase()
  const isVideo = extension in videos
  if (!path.startsWith(content.root + sep) || (!images.includes(extension) && !isVideo)) {
    return response.notFound('Görsel bulunamadı')
  }
  let file: Stats
  try {
    file = await stat(path)
    if (!file.isFile()) return response.notFound('Görsel bulunamadı')
  } catch {
    return response.notFound('Görsel bulunamadı')
  }
  // Uploads get fresh UUID names, so a week of caching never serves an outdated file.
  response.header('Cache-Control', `public, max-age=${cacheLifetimes.content}`)
  response.header('X-Content-Type-Options', 'nosniff')
  if (isVideo) return serveVideo(ctx, path, file)
  const width = Number(ctx.request.qs().w)
  if (variantWidths.includes(width) && resizable.includes(extension)) {
    const variant = await variantOf(path, segments, file, width)
    if (variant) {
      response.header('Content-Type', 'image/webp')
      return response.download(variant, true)
    }
  }
  if (extname(path).toLowerCase() === '.svg')
    for (const [name, value] of Object.entries(svgHeaders)) response.header(name, value)
  return response.download(path, true)
}
