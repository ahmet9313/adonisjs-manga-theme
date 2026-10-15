import { defineConfig } from '@adonisjs/static'
import { sep } from 'node:path'

/** Browser cache lifetimes (seconds). Vite bundles have content hashes, so they never change. */
export const cacheLifetimes = {
  hashedAssets: 31_536_000,
  content: 604_800,
  images: 86_400,
}

/**
 * Hardening for SVG files: opened directly they are documents, so scripts inside them must not
 * run on this origin. Used by the static server and the media controller.
 */
export const svgHeaders = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
}

const inFolder = (path: string, folder: string) => path.includes(`${sep}${folder}${sep}`)

const staticServerConfig = defineConfig({
  enabled: true,
  etag: true,
  lastModified: true,
  dotFiles: 'ignore',
  headers: (path) => {
    const headers: Record<string, string> = { 'X-Content-Type-Options': 'nosniff' }
    if (inFolder(path, 'assets'))
      headers['Cache-Control'] = `public, max-age=${cacheLifetimes.hashedAssets}, immutable`
    else if (inFolder(path, 'content'))
      headers['Cache-Control'] = `public, max-age=${cacheLifetimes.content}`
    else if (inFolder(path, 'images'))
      headers['Cache-Control'] = `public, max-age=${cacheLifetimes.images}`
    if (path.toLowerCase().endsWith('.svg')) Object.assign(headers, svgHeaders)
    return headers
  },
})

export default staticServerConfig
