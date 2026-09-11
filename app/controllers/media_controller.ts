import type { HttpContext } from '@adonisjs/core/http'
import content from '#config/content'
import { resolve, sep, extname } from 'node:path'
import { stat } from 'node:fs/promises'

export default class MediaController {
  async show({ params, response }: HttpContext) {
    const segments = Array.isArray(params['*']) ? params['*'] : [params['*'] || '']
    const path = resolve(content.root, ...segments)
    if (
      !path.startsWith(content.root + sep) ||
      !['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(extname(path).toLowerCase())
    ) {
      return response.notFound('Görsel bulunamadı')
    }
    try {
      const file = await stat(path)
      if (!file.isFile()) return response.notFound('Görsel bulunamadı')
    } catch {
      return response.notFound('Görsel bulunamadı')
    }
    return response.download(path)
  }
}
