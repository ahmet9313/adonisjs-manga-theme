import { invalidField } from '#services/upload_service'
import { now, slugify, pageNumber, pageSize } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import Author from '#models/author'
import vine from '@vinejs/vine'

const authorValidator = vine.compile(
  vine.object({ name: vine.string().trim().minLength(1).maxLength(255) })
)

export default class AuthorController {
  async index({ view, request }: HttpContext) {
    const page = pageNumber(request.input('page'))
    const perPage = pageSize(request.input('per_page'))
    const authors = await Author.query().orderBy('name', 'asc').paginate(page, perPage)
    authors.baseUrl('/admin/yazarlar')
    authors.queryString({ per_page: perPage })
    return view.render('pages/admin/authors/index', {
      title: 'Yazarlar',
      authors,
      paginator: authors,
      perPage,
    })
  }

  async create({ view }: HttpContext) {
    return view.render('pages/admin/authors/form', { title: 'Yeni Yazar Ekle' })
  }

  async store({ request, session, response }: HttpContext) {
    const data = await request.validateUsing(authorValidator)
    if (!slugify(data.name)) invalidField('name', 'Ad en az bir harf veya rakam içermeli.')
    const existing = await Author.query()
      .where('name', data.name)
      .orWhere('slug', slugify(data.name))
      .first()
    if (existing) {
      session.flash('error', 'Bu yazar zaten mevcut')
      return response.redirect('/admin/yazarlar/ekle')
    }
    const timestamp = now()
    await Author.create({
      name: data.name,
      slug: slugify(data.name),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    session.flash('success', 'Yazar eklendi')
    return response.redirect('/admin/yazarlar')
  }

  async edit({ view, params }: HttpContext) {
    const author = await Author.findOrFail(params.id)
    return view.render('pages/admin/authors/form', { title: 'Yazar Düzenle', author })
  }

  async update({ request, params, session, response }: HttpContext) {
    const author = await Author.findOrFail(params.id)
    const data = await request.validateUsing(authorValidator)
    if (!slugify(data.name)) invalidField('name', 'Ad en az bir harf veya rakam içermeli.')
    const existing = await Author.query()
      .where((q) => q.where('name', data.name).orWhere('slug', slugify(data.name)))
      .whereNot('id', author.id)
      .first()
    if (existing) {
      session.flash('error', 'Bu isimde başka bir yazar zaten mevcut')
      return response.redirect(`/admin/yazarlar/${author.id}/duzenle`)
    }
    author.name = data.name
    author.slug = slugify(data.name)
    author.updatedAt = now()
    await author.save()
    session.flash('success', 'Yazar güncellendi')
    return response.redirect('/admin/yazarlar')
  }

  async destroy({ params, session, response }: HttpContext) {
    const author = await Author.findOrFail(params.id)
    try {
      await author.delete()
      session.flash('success', 'Yazar silindi')
    } catch {
      session.flash('error', 'Bu yazar serilere bağlı olduğu için silinemez')
    }
    return response.redirect('/admin/yazarlar')
  }
}
