import type { HttpContext } from '@adonisjs/core/http'
import Page from '#models/page'
import access from '#services/access_service'
import posts, { postSummary } from '#services/post_service'
import { COOKIE_NOTICE_COOKIE, COOKIE_NOTICE_MAX_AGE } from '#services/site_content_service'
import { safeNext } from '#services/account_service'
import { pageNumber } from '#services/input_service'
import { plainText, renderMarkdown } from '#services/markdown_service'

/** Static pages (`/sayfa/:slug`), announcements (`/duyurular`) and the cookie notice. */
export default class ContentController {
  /** Unpublished pages answer 404, except for staff who get a preview with a notice. */
  async page({ params, view, auth, response }: HttpContext) {
    const page = await Page.findBy('slug', String(params.slug))
    if (!page || (!page.published && !access.canSeeDrafts(auth.user))) {
      response.status(404)
      return view.render('pages/errors/not_found')
    }
    return view.render('pages/content/page', {
      page,
      html: renderMarkdown(page.body),
      description: plainText(page.body.replace(/^>.*$/gm, ''), 160),
    })
  }

  async posts({ request, view }: HttpContext) {
    const result = await posts.list(pageNumber(request.input('page')))
    return view.render('pages/content/posts', {
      items: result.all().map(postSummary),
      currentPage: result.currentPage,
      totalPages: result.lastPage,
      total: result.total,
    })
  }

  async post({ params, view, auth, response }: HttpContext) {
    const found = await posts.find(String(params.slug), auth.user)
    if (!found) {
      response.status(404)
      return view.render('pages/errors/not_found')
    }
    return view.render('pages/content/post', {
      ...found,
      description: plainText(found.post.body, 160),
    })
  }

  /**
   * "Tamam" on the cookie notice without JavaScript (with it, the script writes the same cookie
   * and hides the bar in place). Remembered for a year.
   */
  async acceptCookies({ request, response }: HttpContext) {
    response.plainCookie(COOKIE_NOTICE_COOKIE, '1', {
      encode: false,
      maxAge: COOKIE_NOTICE_MAX_AGE,
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
    })
    return response.redirect(safeNext(request.input('next')))
  }
}
