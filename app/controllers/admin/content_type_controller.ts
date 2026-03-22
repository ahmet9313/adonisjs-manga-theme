import type { HttpContext } from '@adonisjs/core/http'
import ContentType from '#models/content_type'
import vine from '@vinejs/vine'

function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function slugify(text: string): string {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

const contentTypeValidator = vine.compile(
  vine.object({ name: vine.string().minLength(1).maxLength(50) })
)

export default class ContentTypeController {
  async index({ view, request }: HttpContext) {
    const page = request.input('page', 1)
    const allowedSizes = [10, 20, 30, 50, 1000, 5000]
    const perPage = allowedSizes.includes(Number(request.input('per_page'))) ? Number(request.input('per_page')) : 20
    const contentTypes = await ContentType.query().orderBy('name', 'asc').paginate(page, perPage)
    contentTypes.baseUrl('/admin/icerik-turleri')
    contentTypes.queryString({ per_page: perPage })
    return view.render('pages/admin/content_types/index', { title: 'İçerik Türleri', contentTypes, paginator: contentTypes, perPage })
  }

  async create({ view }: HttpContext) {
    return view.render('pages/admin/content_types/form', { title: 'Yeni İçerik Türü Ekle' })
  }

  async store({ request, session, response }: HttpContext) {
    const data = await request.validateUsing(contentTypeValidator)
    const existing = await ContentType.findBy('name', data.name)
    if (existing) {
      session.flash('error', 'Bu içerik türü zaten mevcut')
      return response.redirect('/admin/icerik-turleri/ekle')
    }
    const timestamp = now()
    await ContentType.create({ name: data.name, slug: slugify(data.name), createdAt: timestamp, updatedAt: timestamp })
    session.flash('success', 'İçerik türü eklendi')
    return response.redirect('/admin/icerik-turleri')
  }

  async edit({ view, params }: HttpContext) {
    const contentType = await ContentType.findOrFail(params.id)
    return view.render('pages/admin/content_types/form', { title: 'İçerik Türü Düzenle', contentType })
  }

  async update({ request, params, session, response }: HttpContext) {
    const contentType = await ContentType.findOrFail(params.id)
    const data = await request.validateUsing(contentTypeValidator)
    const existing = await ContentType.query().where('name', data.name).whereNot('id', contentType.id).first()
    if (existing) {
      session.flash('error', 'Bu isimde başka bir içerik türü zaten mevcut')
      return response.redirect(`/admin/icerik-turleri/${contentType.id}/duzenle`)
    }
    contentType.name = data.name
    contentType.slug = slugify(data.name)
    await contentType.save()
    session.flash('success', 'İçerik türü güncellendi')
    return response.redirect('/admin/icerik-turleri')
  }

  async destroy({ params, session, response }: HttpContext) {
    const contentType = await ContentType.findOrFail(params.id)
    try {
      await contentType.delete()
      session.flash('success', 'İçerik türü silindi')
    } catch {
      session.flash('error', 'Bu içerik türü serilere bağlı olduğu için silinemez')
    }
    return response.redirect('/admin/icerik-turleri')
  }
}
