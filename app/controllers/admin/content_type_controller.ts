import { invalidField } from '#services/upload_service'
import { now, slugify, pageNumber, pageSize } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import ContentType from '#models/content_type'
import vine from '@vinejs/vine'

const contentTypeValidator = vine.compile(
  vine.object({ name: vine.string().trim().minLength(1).maxLength(50) })
)

export default class ContentTypeController {
  async index({ view, request }: HttpContext) {
    const page = pageNumber(request.input('page'))
    const perPage = pageSize(request.input('per_page'))
    const contentTypes = await ContentType.query().orderBy('name', 'asc').paginate(page, perPage)
    contentTypes.baseUrl('/admin/icerik-turleri')
    contentTypes.queryString({ per_page: perPage })
    return view.render('pages/admin/content_types/index', {
      title: 'İçerik Türleri',
      contentTypes,
      paginator: contentTypes,
      perPage,
    })
  }

  async create({ view }: HttpContext) {
    return view.render('pages/admin/content_types/form', { title: 'Yeni İçerik Türü Ekle' })
  }

  async store({ request, session, response }: HttpContext) {
    const data = await request.validateUsing(contentTypeValidator)
    if (!slugify(data.name)) invalidField('name', 'Ad en az bir harf veya rakam içermeli.')
    const existing = await ContentType.query()
      .where('name', data.name)
      .orWhere('slug', slugify(data.name))
      .first()
    if (existing) {
      session.flash('error', 'Bu içerik türü zaten mevcut')
      return response.redirect('/admin/icerik-turleri/ekle')
    }
    const timestamp = now()
    await ContentType.create({
      name: data.name,
      slug: slugify(data.name),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    session.flash('success', 'İçerik türü eklendi')
    return response.redirect('/admin/icerik-turleri')
  }

  async edit({ view, params }: HttpContext) {
    const contentType = await ContentType.findOrFail(params.id)
    return view.render('pages/admin/content_types/form', {
      title: 'İçerik Türü Düzenle',
      contentType,
    })
  }

  async update({ request, params, session, response }: HttpContext) {
    const contentType = await ContentType.findOrFail(params.id)
    const data = await request.validateUsing(contentTypeValidator)
    if (!slugify(data.name)) invalidField('name', 'Ad en az bir harf veya rakam içermeli.')
    const existing = await ContentType.query()
      .where((q) => q.where('name', data.name).orWhere('slug', slugify(data.name)))
      .whereNot('id', contentType.id)
      .first()
    if (existing) {
      session.flash('error', 'Bu isimde başka bir içerik türü zaten mevcut')
      return response.redirect(`/admin/icerik-turleri/${contentType.id}/duzenle`)
    }
    contentType.name = data.name
    contentType.updatedAt = now()
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
