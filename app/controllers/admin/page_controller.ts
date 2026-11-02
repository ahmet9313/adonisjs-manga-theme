import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Page from '#models/page'
import siteContent, { PAGE_BODY_LIMIT } from '#services/site_content_service'
import { uniqueSlug } from '#services/post_service'
import { invalidField } from '#services/upload_service'
import { now } from '#services/input_service'
import { renderMarkdown } from '#services/markdown_service'

const pageValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(120),
    slug: vine.string().trim().maxLength(140).optional(),
    body: vine.string().trim().minLength(1).maxLength(PAGE_BODY_LIMIT),
    sort: vine.number().withoutDecimals().range([0, 9999]).optional(),
    show_in_footer: vine.enum(['on']).optional(),
    published: vine.enum(['on']).optional(),
  })
)

const previewValidator = vine.compile(
  vine.object({ body: vine.string().maxLength(PAGE_BODY_LIMIT).optional() })
)

/**
 * Static pages (Admin → İçerik → Sayfalar, administrators only): Hakkımızda, S.S.S., DMCA,
 * KVKK … The body is the Markdown subset of app/services/markdown_service.ts; the address comes
 * from the title unless one is typed and stays the same when the title changes.
 */
export default class PageAdminController {
  async index({ view }: HttpContext) {
    const items = await Page.query().orderBy('sort', 'asc').orderBy('id', 'asc')
    return view.render('pages/admin/content/pages', { title: 'Sayfalar', items })
  }

  async create({ view }: HttpContext) {
    const last = await Page.query().max('sort as sort').first()
    return view.render('pages/admin/content/page_form', {
      title: 'Yeni Sayfa',
      nextSort: Number(last?.$extras.sort || 0) + 10,
      limit: PAGE_BODY_LIMIT,
    })
  }

  async store({ request, session, response }: HttpContext) {
    await this.save(request, new Page())
    session.flash('success', 'Sayfa eklendi')
    return response.redirect('/admin/sayfalar')
  }

  async edit({ view, params }: HttpContext) {
    const page = await Page.findOrFail(params.id)
    return view.render('pages/admin/content/page_form', {
      title: 'Sayfa Düzenle',
      page,
      previewHtml: renderMarkdown(page.body),
      limit: PAGE_BODY_LIMIT,
    })
  }

  async update({ request, params, session, response }: HttpContext) {
    const page = await Page.findOrFail(params.id)
    await this.save(request, page)
    session.flash('success', 'Sayfa güncellendi')
    return response.redirect('/admin/sayfalar')
  }

  async destroy({ params, session, response }: HttpContext) {
    const page = await Page.findOrFail(params.id)
    await page.delete()
    siteContent.forget()
    session.flash('success', 'Sayfa silindi')
    return response.redirect('/admin/sayfalar')
  }

  /** POST /admin/icerik/onizleme (`body`): the same server renderer, for the live preview. */
  async preview({ request, response }: HttpContext) {
    const data = await request.validateUsing(previewValidator)
    return response.send({ html: renderMarkdown(data.body ?? '') })
  }

  private async save(request: HttpContext['request'], page: Page) {
    const data = await request.validateUsing(pageValidator)
    const exceptId = page.$isPersisted ? page.id : null
    let slug = page.$isPersisted ? page.slug : ''
    if (data.slug || !page.$isPersisted) {
      slug = await uniqueSlug('pages', data.slug || data.title, exceptId)
      if (!slug)
        invalidField(
          data.slug ? 'slug' : 'title',
          'Adres en az bir harf veya rakam içermeli (başlıktan oluşturulur).'
        )
    }
    const timestamp = now()
    page.merge({
      title: data.title,
      slug,
      body: data.body,
      sort: data.sort ?? page.sort ?? 0,
      showInFooter: Boolean(data.show_in_footer),
      published: Boolean(data.published),
      updatedAt: timestamp,
    })
    if (!page.$isPersisted) page.createdAt = timestamp
    await page.save()
    siteContent.forget()
  }
}
