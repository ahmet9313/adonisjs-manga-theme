import type { HttpContext } from '@adonisjs/core/http'
import content from '#config/content'
import { cacheLifetimes, svgHeaders } from '#config/static'
import { resolve, sep, extname } from 'node:path'
import { stat } from 'node:fs/promises'
import { createReadStream, type Stats } from 'node:fs'
import { Readable } from 'node:stream'

const images = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']
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
  if (extname(path).toLowerCase() === '.svg')
    for (const [name, value] of Object.entries(svgHeaders)) response.header(name, value)
  return response.download(path, true)
}

export default class MediaController {
  async show(ctx: HttpContext) {
    const { params } = ctx
    const segments = Array.isArray(params['*']) ? params['*'] : [params['*'] || '']
    return serveContent(ctx, segments)
  }
}
