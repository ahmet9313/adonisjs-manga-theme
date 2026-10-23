import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { HttpError, StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'

/** Shown instead of internal error details (SQL, file paths) when debugging is off. */
export const GENERIC_SERVER_ERROR = 'Sunucu hatası. Lütfen biraz sonra tekrar deneyin.'

/** Last resort when even the error template fails to render. */
const FALLBACK_HTML =
  '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Hata</title></head>' +
  '<body style="background:#000022;color:#fff;font-family:system-ui;text-align:center;padding:4rem">' +
  '<h1>Bir şeyler ters gitti</h1><p><a href="/" style="color:#3fba67">Ana sayfaya dön</a></p></body></html>'

/** Admin sections whose `/admin/<section>/:id/...` pages load one record, with its name for the notice. */
const ADMIN_RECORDS: Record<string, string> = {
  'seriler': 'Seri',
  'bolumler': 'Bölüm',
  'turler': 'Tür',
  'yazarlar': 'Yazar',
  'cizerler': 'Çizer',
  'icerik-turleri': 'İçerik türü',
  'kozmetikler': 'Kozmetik',
  'kartlar': 'Kart',
  'kullanicilar': 'Kullanıcı',
  'sayfalar': 'Sayfa',
  'duyurular': 'Duyuru',
}

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Status pages are used to display a custom HTML pages for certain error
   * codes. You might want to enable them in production only, but feel
   * free to enable them in development as well.
   */
  protected renderStatusPages = app.inProduction

  /**
   * Error templates use the session-free `layout/error`: unmatched URLs never reach the router
   * middleware, so flash messages, CSRF and auth are not available while rendering them.
   */
  protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {
    '403': (_error, ctx) => this.renderPage(ctx, 'pages/errors/forbidden'),
    '404': (_error, ctx) => this.renderPage(ctx, 'pages/errors/not_found'),
    '500..599': (_error, ctx) => this.renderPage(ctx, 'pages/errors/server_error'),
  }

  private async renderPage({ view }: HttpContext, template: string) {
    try {
      return await view.render(template)
    } catch (error) {
      logger.error({ err: error }, `Hata sayfası oluşturulamadı: ${template}`)
      return FALLBACK_HTML
    }
  }

  /** Server errors never echo their message to clients unless debugging is enabled. */
  private hideDetails(error: HttpError, ctx: HttpContext) {
    return error.status >= 500 && !this.isDebuggingEnabled(ctx)
  }

  async renderErrorAsJSON(error: HttpError, ctx: HttpContext) {
    if (this.hideDetails(error, ctx))
      return ctx.response.status(error.status).send({ message: GENERIC_SERVER_ERROR })
    return super.renderErrorAsJSON(error, ctx)
  }

  async renderErrorAsJSONAPI(error: HttpError, ctx: HttpContext) {
    if (this.hideDetails(error, ctx))
      return ctx.response
        .status(error.status)
        .send({ errors: [{ title: GENERIC_SERVER_ERROR, status: error.status }] })
    return super.renderErrorAsJSONAPI(error, ctx)
  }

  async renderErrorAsHTML(error: HttpError, ctx: HttpContext) {
    if (this.hideDetails(error, ctx) && !this.renderStatusPages)
      return ctx.response.status(error.status).send(FALLBACK_HTML)
    return super.renderErrorAsHTML(error, ctx)
  }

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    if (this.handleMissingAdminRecord(error, ctx)) return
    return super.handle(error, ctx)
  }

  /**
   * A record opened in the admin panel can disappear while its page is open (e.g. its series was
   * deleted in another tab, which also deletes its chapters). Instead of a 404 page, the editor is
   * sent back to that section's list with a notice; JSON requests (the chapter upload) get a 404
   * with the same message.
   */
  private handleMissingAdminRecord(error: unknown, ctx: HttpContext) {
    if ((error as { code?: string } | null)?.code !== 'E_ROW_NOT_FOUND') return false
    const section = /^\/admin\/([^/]+)\/[^/]+/.exec(ctx.request.url())?.[1]
    if (!section || !Object.hasOwn(ADMIN_RECORDS, section)) return false

    const message = `${ADMIN_RECORDS[section]} bulunamadı; silinmiş olabilir.`
    if (ctx.session && ctx.request.accepts(['html', 'json']) === 'html') {
      ctx.session.flash('error', message)
      ctx.response.redirect(`/admin/${section}`)
    } else {
      ctx.response.status(404).send({ message })
    }
    return true
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
