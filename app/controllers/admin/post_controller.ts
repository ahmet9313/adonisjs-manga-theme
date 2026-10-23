import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Post from '#models/post'
import { uniqueSlug } from '#services/post_service'
import { invalidField } from '#services/upload_service'
import { now, pageNumber } from '#services/input_service'
import { POST_BODY_LIMIT } from '#services/site_content_service'
import { renderMarkdown } from '#services/markdown_service'

const postValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(160),
    slug: vine.string().trim().maxLength(180).optional(),
    body: vine.string().trim().minLength(1).maxLength(POST_BODY_LIMIT),
    pinned: vine.enum(['on']).optional(),
    published: vine.enum(['on']).optional(),
  })
)

/**
 * Announcements (Admin → İçerik → Duyurular, administrators and editors). Publishing stamps the
 * date once; unpublishing turns the announcement back into a draft (the date is cleared, so a
 * later publish shows it as new).
 */
export default class PostAdminController {
  async index({ view, request }: HttpContext) {
    const items = await Post.query()
      .preload('author')
      // Drafts first: they are the ones still being worked on.
      .orderByRaw('CASE WHEN published_at IS NULL THEN 0 ELSE 1 END')
      .orderBy('pinned', 'desc')
      .orderBy('publishedAt', 'desc')
      .orderBy('id', 'desc')
      .paginate(pageNumber(request.input('page')), 20)
    items.baseUrl('/admin/duyurular')
    return view.render('pages/admin/content/posts', { title: 'Duyurular', items })
  }

  async create({ view }: HttpContext) {
    return view.render('pages/admin/content/post_form', {
      title: 'Yeni Duyuru',
      limit: POST_BODY_LIMIT,
    })
  }

  async store({ request, session, response, auth }: HttpContext) {
    const post = new Post()
    post.authorId = auth.user!.id
    await this.save(request, post)
    session.flash(
      'success',
      post.publishedAt ? 'Duyuru yayınlandı' : 'Duyuru taslak olarak kaydedildi'
    )
    return response.redirect('/admin/duyurular')
  }

  async edit({ view, params }: HttpContext) {
    const post = await Post.query().where('id', params.id).preload('author').firstOrFail()
    return view.render('pages/admin/content/post_form', {
      title: 'Duyuru Düzenle',
      post,
      previewHtml: renderMarkdown(post.body),
      limit: POST_BODY_LIMIT,
    })
  }

  async update({ request, params, session, response }: HttpContext) {
    const post = await Post.findOrFail(params.id)
    await this.save(request, post)
    session.flash('success', 'Duyuru güncellendi')
    return response.redirect('/admin/duyurular')
  }

  async destroy({ params, session, response }: HttpContext) {
    const post = await Post.findOrFail(params.id)
    await post.delete()
    session.flash('success', 'Duyuru silindi')
    return response.redirect('/admin/duyurular')
  }

  private async save(request: HttpContext['request'], post: Post) {
    const data = await request.validateUsing(postValidator)
    const exceptId = post.$isPersisted ? post.id : null
    let slug = post.$isPersisted ? post.slug : ''
    if (data.slug || !post.$isPersisted) {
      slug = await uniqueSlug('posts', data.slug || data.title, exceptId)
      if (!slug)
        invalidField(
          data.slug ? 'slug' : 'title',
          'Adres en az bir harf veya rakam içermeli (başlıktan oluşturulur).'
        )
    }
    const timestamp = now()
    post.merge({
      title: data.title,
      slug,
      body: data.body,
      pinned: Boolean(data.pinned),
      publishedAt: data.published ? (post.publishedAt ?? timestamp) : null,
      updatedAt: timestamp,
    })
    if (!post.$isPersisted) post.createdAt = timestamp
    await post.save()
  }
}
