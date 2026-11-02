import { randomBytes } from 'node:crypto'
import { access, constants, mkdir } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { MigrationRunner } from '@adonisjs/lucid/migration'
import env from '#start/env'
import installConfig from '#config/install'
import contentConfig from '#config/content'
import { suggestedFormat } from '#config/site'
import ContentType from '#models/content_type'
import Genre from '#models/genre'
import settings from '#services/settings_service'
import { now, slugify } from '#services/input_service'

/** Settings key written when the wizard finishes (or for a site that already had an admin). */
export const INSTALLED_KEY = 'installed_at'
/** Written when the wizard creates the first administrator, so that admin does not end it early. */
export const WIZARD_KEY = 'install_wizard'

export interface SystemCheck {
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
}

export type SeedPart = 'series' | 'community'

interface SeedJob {
  state: 'idle' | 'running' | 'done' | 'error'
  parts: SeedPart[]
  step: string
  error: string | null
}

const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const forwardedHeaders = ['x-forwarded-for', 'forwarded', 'x-real-ip']

/**
 * First-run setup (`/kurulum`, config/install.ts). The site counts as installed once the
 * `installed_at` setting exists; a database that already has an administrator not made by the
 * wizard (sites from before it, `--seed` demo data) gets that setting the first time it is asked,
 * so nothing changes for them.
 * Until then every page redirects to the wizard (install_gate_middleware). Visitors on the same
 * machine use the wizard directly; from elsewhere they need the key printed in the server console,
 * so nobody can take over a fresh public server before its owner.
 */
class InstallService {
  private installed: boolean | null = null
  /** Tests run with an installed site unless a wizard test asks for a fresh one. */
  testFresh = false
  readonly key = randomBytes(16)
    .toString('base64')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, installConfig.keyLength)
    .toUpperCase()
  private job: SeedJob = { state: 'idle', parts: [], step: '', error: null }

  /**
   * Cached once true; checked against the database until then. An administrator the wizard did
   * not create (an existing site) marks the site installed right away.
   */
  async isInstalled() {
    if (app.inTest && !this.testFresh) return true
    if (this.installed) return true
    try {
      const rows = await db.from('settings').whereIn('key', [INSTALLED_KEY, WIZARD_KEY])
      if (rows.some((row) => row.key === INSTALLED_KEY)) return (this.installed = true)
      if (!rows.length && (await db.from('users').where('role', 'admin').first())) {
        await this.markInstalled()
        return true
      }
    } catch {
      // No tables yet: a brand-new database.
    }
    return false
  }

  /** Start-up check (start/install.ts); the same rule as every request. */
  adoptExisting() {
    return this.isInstalled()
  }

  /** The wizard is about to create the first administrator. */
  async startWizardAdmin() {
    await settings.save({ [WIZARD_KEY]: now() })
  }

  async markInstalled() {
    await settings.save({ [INSTALLED_KEY]: now() })
    this.installed = true
  }

  /** For tests: forget the cached state. */
  reset() {
    this.installed = null
    this.job = { state: 'idle', parts: [], step: '', error: null }
  }

  /** Same machine (no proxy in between) needs no key. */
  isLocal(request: {
    request: { socket: { remoteAddress?: string } }
    header(name: string): unknown
  }) {
    const address = request.request.socket.remoteAddress ?? ''
    return loopback.has(address) && forwardedHeaders.every((name) => !request.header(name))
  }

  keyMatches(value: unknown) {
    return (
      typeof value === 'string' && value.trim().toUpperCase() === this.key && this.key.length > 0
    )
  }

  private runner() {
    return new MigrationRunner(db, app, { direction: 'up' })
  }

  /** Migrations not applied yet (file names). */
  async pendingMigrations() {
    const list = await this.runner().getList()
    return list.filter((node) => node.status === 'pending').map((node) => node.name)
  }

  /** Applies pending migrations in this process (the same as `node ace migration:run`). */
  async migrate() {
    const runner = this.runner()
    await runner.run()
    if (runner.error) throw runner.error
    await settings.reload()
    return Object.keys(runner.migratedFiles).length
  }

  async hasTables() {
    try {
      await db.from('users').select('id').limit(1)
      return true
    } catch {
      return false
    }
  }

  async adminCount() {
    try {
      const row = await db.from('users').where('role', 'admin').count('* as total').first()
      return Number(row?.total ?? 0)
    } catch {
      return 0
    }
  }

  /** What the welcome step shows; `fail` blocks the wizard, `warn` only informs. */
  async checks(): Promise<SystemCheck[]> {
    const checks: SystemCheck[] = []
    const major = Number(process.versions.node.split('.')[0])
    checks.push({
      label: 'Node.js',
      status: major >= 24 ? 'ok' : 'fail',
      detail:
        major >= 24
          ? `v${process.versions.node}`
          : `v${process.versions.node} — 24 veya üstü gerekir`,
    })

    const connection = env.get('DB_CONNECTION', 'sqlite')
    try {
      await db.rawQuery('select 1')
      checks.push({
        label: 'Veritabanı',
        status: 'ok',
        detail:
          connection === 'mysql'
            ? `MySQL · ${env.get('DB_DATABASE', '')}@${env.get('DB_HOST', '')}`
            : `SQLite · ${env.get('SQLITE_DB_PATH', 'tmp/manga.sqlite3')}`,
      })
    } catch (error) {
      checks.push({
        label: 'Veritabanı',
        status: 'fail',
        detail: `Bağlanılamadı (${connection}): ${(error as Error).message.slice(0, 160)}`,
      })
    }

    for (const [label, dir] of [
      ['İçerik klasörü', contentConfig.root],
      ['Geçici klasör', app.tmpPath()],
    ] as const) {
      try {
        await mkdir(dir, { recursive: true })
        await access(dir, constants.W_OK)
        checks.push({ label, status: 'ok', detail: `${dir} yazılabilir` })
      } catch {
        checks.push({
          label,
          status: 'fail',
          detail: `${dir} yazılamıyor; klasör izinlerini düzeltin`,
        })
      }
    }

    try {
      await import('sharp')
      checks.push({
        label: 'Görsel küçültme (sharp)',
        status: 'ok',
        detail: 'Küçük WebP kopyalar üretilecek',
      })
    } catch {
      checks.push({
        label: 'Görsel küçültme (sharp)',
        status: 'warn',
        detail: 'Yüklenemedi; site çalışır ama görseller asıl boyutlarıyla sunulur',
      })
    }

    checks.push(
      env.get('SMTP_HOST')
        ? { label: 'E-posta', status: 'ok', detail: `SMTP · ${env.get('SMTP_HOST')}` }
        : {
            label: 'E-posta',
            status: 'warn',
            detail:
              'SMTP ayarlı değil; şifre sıfırlama postaları sunucu günlüğüne yazılır (.env → SMTP_HOST)',
          }
    )
    return checks
  }

  /** Default content types (with their image/text/video format) and genres, if missing. */
  async createBasics() {
    let types = 0
    let genres = 0
    for (const name of installConfig.contentTypes) {
      const slug = slugify(name)
      if (await ContentType.findBy('slug', slug)) continue
      await ContentType.create({ name, slug, format: suggestedFormat(slug) })
      types++
    }
    for (const name of installConfig.genres) {
      const slug = slugify(name)
      if (await Genre.findBy('slug', slug)) continue
      await Genre.create({ name, slug })
      genres++
    }
    return { types, genres }
  }

  /** Demo data is for local trials only (the seeders refuse production). */
  get canSeed() {
    return !app.inProduction
  }

  seedStatus() {
    return { ...this.job }
  }

  /**
   * Loads the sample series (and optionally the demo community) in the background; the wizard
   * polls `seedStatus()`. One job at a time.
   */
  startSeed(parts: SeedPart[]) {
    if (this.job.state === 'running' || !this.canSeed || !parts.length) return false
    this.job = { state: 'running', parts, step: 'Hazırlanıyor', error: null }
    void this.runSeed(parts)
    return true
  }

  private async runSeed(parts: SeedPart[]) {
    try {
      if (parts.includes('series')) {
        this.job.step = 'Örnek seriler ve bölümler yükleniyor'
        const { default: SeriesSeeder } = await import('#database/seeders/series_seeder')
        await new SeriesSeeder(db.connection()).run()
      }
      if (parts.includes('community')) {
        this.job.step = 'Demo topluluk (hesaplar, yorumlar, incelemeler) oluşturuluyor'
        const { default: SocialSeeder } = await import('#database/seeders/social_seeder')
        await new SocialSeeder(db.connection()).run()
      }
      this.job.state = 'done'
      this.job.step = 'Tamamlandı'
    } catch (error) {
      logger.error({ err: error }, 'Kurulum: örnek içerik yüklenemedi')
      this.job.state = 'error'
      this.job.error = (error as Error).message.slice(0, 300)
    }
  }
}

export default new InstallService()
