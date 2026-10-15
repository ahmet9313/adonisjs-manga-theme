import type { HttpContext } from '@adonisjs/core/http'
import content from '#config/content'
import { cacheLifetimes, svgHeaders } from '#config/static'
import { resolve, sep, extname } from 'node:path'
import { stat } from 'node:fs/promises'

const servable = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']

/**
 * Streams one file from the content root. Shared by the session-free `content_middleware`
 * (normal path) and the `/content/*` route (fallback).
 */
export async function serveContent({ response }: HttpContext, segments: string[]) {
  const path = resolve(content.root, ...segments)
  if (!path.startsWith(content.root + sep) || !servable.includes(extname(path).toLowerCase())) {
    return response.notFound('Görsel bulunamadı')
  }
  try {
    const file = await stat(path)
    if (!file.isFile()) return response.notFound('Görsel bulunamadı')
  } catch {
    return response.notFound('Görsel bulunamadı')
  }
  // Uploads get fresh UUID names, so a week of caching never serves an outdated image.
  response.header('Cache-Control', `public, max-age=${cacheLifetimes.content}`)
  response.header('X-Content-Type-Options', 'nosniff')
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
