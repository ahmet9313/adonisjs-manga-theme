import app from '@adonisjs/core/services/app'

/**
 * Administration tools: bulk chapter upload from a ZIP, the file checker and the activity log.
 */
const adminTools = {
  bulk: {
    /** Largest accepted ZIP; it is streamed to `tempDir`, never held in memory. */
    maxZipBytes: 500 * 1024 ** 2,
    /** Zip bomb guards: entries in the archive and the total size of the images inside. */
    maxEntries: 5000,
    maxUncompressedBytes: 2 * 1024 ** 3,
    /** Same limit as a page uploaded from the chapter form (upload_service imageOptions). */
    maxImageBytes: 10 * 1024 ** 2,
    maxChapters: 200,
    maxPagesPerChapter: 500,
    /** Page images; anything else is skipped with a warning. */
    imageExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    /** Uploaded archives wait here between the preview and the import; tests use tmp/test-uploads. */
    tempDir:
      app.getEnvironment() === 'test'
        ? app.tmpPath('test-uploads/bulk')
        : app.tmpPath('bulk-uploads'),
    /** Archives left behind by an abandoned preview are removed after this long. */
    tempMaxAgeMs: 6 * 3_600_000,
  },
  fileCheck: {
    /** The scan stops after this long and says that the result is partial. */
    timeLimitMs: 20_000,
    /** Rows listed on the page; the totals still count everything. */
    maxRows: 500,
    maxOrphanSamples: 50,
  },
  log: {
    retentionDays: 180,
    perPage: 50,
  },
}

export default adminTools

export const logActions = {
  create: { label: 'Ekledi', tone: 'success' },
  update: { label: 'Güncelledi', tone: 'info' },
  delete: { label: 'Sildi', tone: 'danger' },
  publish: { label: 'Yayınladı', tone: 'accent' },
  bulk_upload: { label: 'Toplu yükledi', tone: 'accent' },
  role: { label: 'Rol değiştirdi', tone: 'warning' },
  theme: { label: 'Temayı kaydetti', tone: 'neutral' },
} as const

export type AdminLogAction = keyof typeof logActions

export const logTargets = {
  series: 'Seri',
  chapter: 'Bölüm',
  user: 'Kullanıcı',
  role: 'Rol',
  theme: 'Tema',
} as const

export type AdminLogTarget = keyof typeof logTargets
