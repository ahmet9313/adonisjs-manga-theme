import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { readdir, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import adminTools from '#config/admin_tools'
import content from '#config/content'
import type Chapter from '#models/chapter'
import { localVideoPaths } from '#services/video_service'

export type MissingKind = 'cover' | 'banner' | 'page' | 'video'

export interface MissingFile {
  kind: MissingKind
  path: string
  series: { id: number; title: string }
  chapter: { id: number; number: number } | null
}

export interface FileCheckReport {
  missing: MissingFile[]
  missingTotal: number
  /** References looked at (covers, banners, pages, videos). */
  checked: number
  files: number
  orphans: {
    count: number
    bytes: number
    folders: { name: string; count: number; bytes: number }[]
    samples: { path: string; size: number }[]
  }
  /** The time limit was reached: some references or folders were not looked at. */
  partial: boolean
  /** Without a full folder scan orphan files cannot be counted. */
  orphansComplete: boolean
  durationMs: number
}

const batch = 64

/**
 * Admin → Dosya Denetimi. Compares what the database points at with what is on disk:
 * - missing: series covers/banners and chapter pages/uploaded videos whose file is gone;
 * - orphans: files under the content folder that nothing refers to (also avatars, comment
 *   images, cosmetics, cards and theme images count as references). Report only: nothing is
 *   deleted. Folders starting with `_` or `.` (generated copies) are not counted.
 * The scan stops at `adminTools.fileCheck.timeLimitMs` and says that the result is partial.
 */
export async function checkFiles(): Promise<FileCheckReport> {
  const started = Date.now()
  const deadline = started + adminTools.fileCheck.timeLimitMs
  const late = () => Date.now() > deadline
  const root = content.root

  // 1. Every file under the content folder with its size.
  const files = new Map<string, number>()
  let walkComplete = true
  const pending = ['']
  while (pending.length) {
    if (late()) {
      walkComplete = false
      break
    }
    const folder = pending.pop()!
    const entries = await readdir(join(root, folder), { withFileTypes: true }).catch(() => [])
    const found: string[] = []
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
      const relative = folder ? `${folder}/${entry.name}` : entry.name
      if (entry.isDirectory()) pending.push(relative)
      else if (entry.isFile()) found.push(relative)
    }
    for (let index = 0; index < found.length; index += batch) {
      const sizes = await Promise.all(
        found.slice(index, index + batch).map((relative) =>
          stat(join(root, relative)).then(
            (info) => info.size,
            () => 0
          )
        )
      )
      found
        .slice(index, index + batch)
        .forEach((relative, offset) => files.set(relative, sizes[offset]))
    }
  }

  // 2. References. `/content/…` is checked against the scan (or the disk when the scan was cut
  //    short); `/images/…` against the public folder; anything else (links) is skipped.
  const publicRoot = app.publicPath()
  const publicCache = new Map<string, boolean>()
  const exists = async (path: string): Promise<boolean | null> => {
    if (path.startsWith('/content/')) {
      const relative = path.slice('/content/'.length)
      const target = resolve(root, ...relative.split('/'))
      if (!target.startsWith(root + sep)) return false
      if (walkComplete) return files.has(relative)
      return stat(target).then(
        (info) => info.isFile(),
        () => false
      )
    }
    if (path.startsWith('/images/') || path === '/favicon.svg') {
      if (!publicCache.has(path)) {
        const target = resolve(publicRoot, ...path.slice(1).split('/'))
        publicCache.set(
          path,
          target.startsWith(publicRoot + sep) &&
            (await stat(target).then(
              (info) => info.isFile(),
              () => false
            ))
        )
      }
      return publicCache.get(path)!
    }
    return null
  }

  const referenced = new Set<string>()
  const missing: MissingFile[] = []
  let missingTotal = 0
  let checked = 0
  let partial = !walkComplete
  const note = async (
    path: string | null | undefined,
    kind: MissingKind,
    series: MissingFile['series'],
    chapter: MissingFile['chapter'] = null
  ) => {
    if (!path) return
    if (path.startsWith('/content/')) referenced.add(path.slice('/content/'.length))
    const found = await exists(path)
    if (found === null) return
    checked++
    if (found) return
    missingTotal++
    if (missing.length < adminTools.fileCheck.maxRows) missing.push({ kind, path, series, chapter })
  }

  const seriesRows = await db
    .from('series')
    .select('id', 'title', 'cover_image', 'banner_image')
    .orderBy('title', 'asc')
  const titles = new Map<number, string>()
  for (const row of seriesRows) {
    const series = { id: Number(row.id), title: String(row.title) }
    titles.set(series.id, series.title)
    await note(row.cover_image, 'cover', series)
    await note(row.banner_image, 'banner', series)
  }

  let lastId = 0
  while (true) {
    if (late()) {
      partial = true
      break
    }
    const rows = await db
      .from('chapters')
      .select('id', 'series_id', 'number', 'content')
      .where('id', '>', lastId)
      .orderBy('id', 'asc')
      .limit(500)
    if (!rows.length) break
    lastId = Number(rows[rows.length - 1].id)
    for (const row of rows) {
      let body: Chapter['content'] | null = null
      try {
        body = typeof row.content === 'string' ? JSON.parse(row.content) : row.content
      } catch {
        continue
      }
      if (!body) continue
      const series = { id: Number(row.series_id), title: titles.get(Number(row.series_id)) || '?' }
      const chapter = { id: Number(row.id), number: Number(row.number) }
      if (body.type === 'images')
        for (const page of body.pages || []) await note(page, 'page', series, chapter)
      for (const video of localVideoPaths(body)) await note(video, 'video', series, chapter)
    }
  }
  missing.sort(
    (a, b) =>
      a.series.title.localeCompare(b.series.title, 'tr') ||
      (a.chapter?.number ?? -1) - (b.chapter?.number ?? -1)
  )

  // 3. Other places that keep `/content/` paths: they are not orphans.
  const other: [string, string[]][] = [
    ['users', ['avatar', 'banner']],
    ['comments', ['image']],
    ['cosmetics', ['image']],
    ['cards', ['image']],
    ['settings', ['value']],
  ]
  for (const [table, columns] of other) {
    for (const column of columns) {
      const rows = await db.from(table).where(column, 'like', '/content/%').select(column)
      for (const row of rows) referenced.add(String(row[column]).slice('/content/'.length))
    }
  }

  const orphanList =
    walkComplete && !partial ? [...files].filter(([path]) => !referenced.has(path)) : []
  const folders = new Map<string, { count: number; bytes: number }>()
  for (const [path, size] of orphanList) {
    const name = path.includes('/') ? path.slice(0, path.indexOf('/')) : '(kök)'
    const folder = folders.get(name) ?? { count: 0, bytes: 0 }
    folder.count++
    folder.bytes += size
    folders.set(name, folder)
  }

  return {
    missing,
    missingTotal,
    checked,
    files: files.size,
    orphans: {
      count: orphanList.length,
      bytes: orphanList.reduce((total, [, size]) => total + size, 0),
      folders: [...folders]
        .map(([name, folder]) => ({ name, ...folder }))
        .sort((a, b) => b.bytes - a.bytes),
      samples: orphanList
        .slice(0, adminTools.fileCheck.maxOrphanSamples)
        .map(([path, size]) => ({ path: `/content/${path}`, size })),
    },
    partial,
    orphansComplete: walkComplete && !partial,
    durationMs: Date.now() - started,
  }
}
