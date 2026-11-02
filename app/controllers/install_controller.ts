import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import installConfig from '#config/install'
import User from '#models/user'
import install, { type SeedPart } from '#services/install_service'
import settings from '#services/settings_service'
import { lookKey } from '#services/theme_service'
import { now } from '#services/input_service'
import {
  assertUniqueIdentity,
  registerValidator,
  SESSION_STAMP,
  sessionStamp,
} from '#services/account_service'

const ALLOWED = 'install_ok'
const base = installConfig.path

/** Steps shown in the wizard's progress list (keys are the route paths under /kurulum). */
const steps = [
  { key: '', label: 'Başlangıç' },
  { key: 'site', label: 'Site bilgileri' },
  { key: 'yonetici', label: 'Yönetici hesabı' },
  { key: 'icerik', label: 'İçerik' },
  { key: 'bitir', label: 'Bitir' },
]

const siteValidator = vine.compile(
  vine.object({
    site_name: vine.string().trim().minLength(2).maxLength(60),
    site_description: vine.string().trim().maxLength(200).optional(),
    site_url: vine
      .string()
      .trim()
      .maxLength(200)
      .regex(/^https?:\/\/[^\s/?#]+\/?$/)
      .optional(),
    default_scheme: vine.enum(['dark', 'light', 'system']),
  })
)

const contentValidator = vine.compile(
  vine.object({
    basics: vine.enum(['on']).optional(),
    series: vine.enum(['on']).optional(),
    community: vine.enum(['on']).optional(),
  })
)

/**
 * First-run setup wizard (config/install.ts, install_service). Reachable only before the site is
 * installed (install_gate_middleware). Visitors on the server machine go straight in; others
 * enter the key printed in the console first. Steps: system checks and database, site details,
 * the first administrator, optional sample content, finish.
 */
export default class InstallController {
  /** Same machine, or the setup key was entered in this session. */
  private allowed({ request, session }: HttpContext) {
    return install.isLocal(request) || session.get(ALLOWED) === true
  }

  /** Database reachable and every migration applied. */
  private async databaseReady() {
    if (!(await install.hasTables())) return false
    const pending = await install.pendingMigrations()
    return pending.length === 0
  }

  private render(ctx: HttpContext, step: string, data: Record<string, unknown> = {}) {
    return ctx.view.render(`pages/install/${step || 'welcome'}`, {
      title: 'Kurulum',
      steps,
      current: step,
      ...data,
    })
  }

  /** Earlier steps first: keyless visitors to the welcome page, then the database, the admin. */
  private async guard(ctx: HttpContext, needs: 'access' | 'database' | 'admin') {
    if (!this.allowed(ctx)) return base
    if (needs === 'access') return null
    if (!(await this.databaseReady())) return base
    if (needs === 'admin' && (await install.adminCount()) === 0) return `${base}/yonetici`
    return null
  }

  async welcome(ctx: HttpContext) {
    const allowed = this.allowed(ctx)
    const checks = await install.checks()
    let pending: string[] = []
    let migrationError = ''
    try {
      pending = await install.pendingMigrations()
    } catch (error) {
      migrationError = (error as Error).message.slice(0, 200)
    }
    return this.render(ctx, '', {
      allowed,
      checks,
      blocked: checks.some((check) => check.status === 'fail'),
      pending,
      migrationError,
    })
  }

  async verifyKey(ctx: HttpContext) {
    const { request, session, response } = ctx
    if (install.keyMatches(request.input('key'))) {
      session.put(ALLOWED, true)
      session.flash('success', 'Anahtar doğrulandı.')
    } else {
      session.flash('error', 'Kurulum anahtarı yanlış. Sunucu konsolundaki anahtarı yazın.')
    }
    return response.redirect(base)
  }

  async migrate(ctx: HttpContext) {
    const { session, response } = ctx
    const redirect = await this.guard(ctx, 'access')
    if (redirect) return response.redirect(redirect)
    try {
      const count = await install.migrate()
      session.flash('success', `Veritabanı hazırlandı (${count} adım uygulandı).`)
    } catch (error) {
      session.flash('error', `Veritabanı hazırlanamadı: ${(error as Error).message.slice(0, 200)}`)
    }
    return response.redirect(base)
  }

  async site(ctx: HttpContext) {
    const redirect = await this.guard(ctx, 'database')
    if (redirect) return ctx.response.redirect(redirect)
    await settings.ready()
    const origin = `${ctx.request.protocol()}://${ctx.request.host()}`
    const local = /^https?:\/\/(localhost|127\.|\[::1\])/.test(origin)
    return this.render(ctx, 'site', {
      values: {
        site_name: settings.get('site_name'),
        site_description: settings.get('site_description'),
        site_url: settings.get('site_url') || (local ? '' : origin),
        default_scheme: settings.get(lookKey('default_scheme')) || 'dark',
      },
    })
  }

  async saveSite(ctx: HttpContext) {
    const redirect = await this.guard(ctx, 'database')
    if (redirect) return ctx.response.redirect(redirect)
    const data = await ctx.request.validateUsing(siteValidator)
    await settings.save({
      site_name: data.site_name,
      site_description: data.site_description ?? '',
      site_url: (data.site_url ?? '').replace(/\/+$/, ''),
      [lookKey('default_scheme')]: data.default_scheme === 'dark' ? '' : data.default_scheme,
    })
    return ctx.response.redirect(`${base}/yonetici`)
  }

  async admin(ctx: HttpContext) {
    const redirect = await this.guard(ctx, 'database')
    if (redirect) return ctx.response.redirect(redirect)
    const existing = await User.query().where('role', 'admin').orderBy('id').first()
    return this.render(ctx, 'yonetici', { existing: existing?.username ?? null })
  }

  async saveAdmin(ctx: HttpContext) {
    const { request, auth, session, response } = ctx
    const redirect = await this.guard(ctx, 'database')
    if (redirect) return response.redirect(redirect)
    // The wizard creates exactly one administrator; more are made under Yönetim → Kullanıcılar.
    if ((await install.adminCount()) > 0) return response.redirect(`${base}/icerik`)
    const data = await request.validateUsing(registerValidator)
    const username = data.username.toLowerCase()
    const email = data.email.toLowerCase()
    await assertUniqueIdentity(username, email)
    await install.startWizardAdmin()
    const timestamp = now()
    const user = await User.create({
      username,
      fullName: data.username,
      email,
      password: data.password,
      role: 'admin',
      emailVerifiedAt: timestamp,
      lastLoginAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await auth.use('web').login(user)
    session.put(SESSION_STAMP, sessionStamp(user))
    return response.redirect(`${base}/icerik`)
  }

  async content(ctx: HttpContext) {
    const redirect = await this.guard(ctx, 'admin')
    if (redirect) return ctx.response.redirect(redirect)
    return this.render(ctx, 'icerik', { canSeed: install.canSeed, job: install.seedStatus() })
  }

  async saveContent(ctx: HttpContext) {
    const { request, session, response } = ctx
    const redirect = await this.guard(ctx, 'admin')
    if (redirect) return response.redirect(redirect)
    const data = await request.validateUsing(contentValidator)
    if (data.basics) {
      const made = await install.createBasics()
      if (made.types || made.genres)
        session.flash('success', `${made.types} içerik türü ve ${made.genres} tür eklendi.`)
    }
    const parts: SeedPart[] = []
    if (data.series) parts.push('series')
    if (data.series && data.community) parts.push('community')
    if (parts.length && install.startSeed(parts)) return response.redirect(`${base}/icerik`)
    return response.redirect(`${base}/bitir`)
  }

  async seedStatus(ctx: HttpContext) {
    if (!this.allowed(ctx)) return ctx.response.status(403).json({ message: 'Yetkisiz.' })
    return install.seedStatus()
  }

  async finish(ctx: HttpContext) {
    const redirect = await this.guard(ctx, 'admin')
    if (redirect) return ctx.response.redirect(redirect)
    await settings.ready()
    return this.render(ctx, 'bitir', {
      siteName: settings.get('site_name'),
      job: install.seedStatus(),
    })
  }

  async complete(ctx: HttpContext) {
    const { session, response } = ctx
    const redirect = await this.guard(ctx, 'admin')
    if (redirect) return response.redirect(redirect)
    if (install.seedStatus().state === 'running') {
      session.flash('error', 'Örnek içerik hâlâ yükleniyor; bitince kurulumu tamamlayabilirsin.')
      return response.redirect(`${base}/bitir`)
    }
    await install.markInstalled()
    session.forget(ALLOWED)
    session.flash('success', 'Kurulum tamamlandı. Siten hazır!')
    return response.redirect('/admin')
  }
}
