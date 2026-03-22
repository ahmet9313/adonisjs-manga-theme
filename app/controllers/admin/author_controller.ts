import type { HttpContext } from '@adonisjs/core/http'
import Author from '#models/author'
import vine from '@vinejs/vine'

function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function slugify(text: string): string {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

const authorValidator = vine.compile(
  vine.object({ name: vine.string().minLength(1).maxLength(255) })
)

export default class AuthorController {
  async index({ view, request }: HttpContext) {
    const page = request.input('page', 1)
    const allowedSizes = [10, 20, 30, 50, 1000, 5000]
    const perPage = allowedSizes.includes(Number(request.input('per_page'))) ? Number(request.input('per_page')) : 20
    const authors = await Author.query().orderBy('name', 'asc').paginate(page, perPage)
    authors.baseUrl('/admin/yazarlar')
    authors.queryString({ per_page: perPage })
    return view.render('pages/admin/authors/index', { title: 'Yazarlar', authors, paginator: authors, perPage })
  }

  async create({ view }: HttpContext) {
    return view.render('pages/admin/authors/form', { title: 'Yeni Yazar Ekle' })
  }

  async store({ request, session, response }: HttpContext) {
    const data = await request.validateUsing(authorValidator)
    const existing = await Author.findBy('name', data.name)
    if (existing) {
      session.flash('error', 'Bu yazar zaten mevcut')
      return response.redirect('/admin/yazarlar/ekle')
    }
    const timestamp = now()
    await Author.create({ name: data.name, slug: slugify(data.name), createdAt: timestamp, updatedAt: timestamp })
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
    const existing = await Author.query().where('name', data.name).whereNot('id', author.id).first()
    if (existing) {
      session.flash('error', 'Bu isimde başka bir yazar zaten mevcut')
      return response.redirect(`/admin/yazarlar/${author.id}/duzenle`)
    }
    author.name = data.name
    author.slug = slugify(data.name)
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
