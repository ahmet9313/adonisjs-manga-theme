import { invalidField } from '#services/upload_service'
import { now, slugify, pageNumber, pageSize, searchText } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import Author from '#models/author'
import vine from '@vinejs/vine'
import { refreshSearchText, seriesOfPerson } from '#services/search_index_service'

const authorValidator = vine.compile(
  vine.object({ name: vine.string().trim().minLength(1).maxLength(255) })
)

/** Labels of the shared dictionary pages (pages/admin/dictionary/*). */
const dictionary = {
  label: 'Yazarlar',
  singular: 'Yazar',
  base: '/admin/yazarlar',
  description:
    'Serilerin yazarları. Seri sayfasında bağlantı olarak görünür ve kataloğu filtreler.',
  nameLabel: 'Yazar adı',
  placeholder: 'ör. Eiichiro Oda',
  maxLength: 255,
  addLabel: 'Yazar ekle',
  slugNote: 'Adres (slug) addan oluşturulur; ad değişince yenilenir.',
  catalogParam: 'author',
  catalogField: 'slug',
  emptyTitle: 'Henüz yazar eklenmemiş',
  emptyText: 'İlk yazarı yukarıdaki formdan ekleyin; seri formunda hemen seçilebilir.',
  deleteTitle: 'Yazar silinsin mi?',
  deleteUsed: 'silinecek ve {n} serinin yazar listesinden çıkarılacak. Seriler silinmez.',
  deleteUnused: 'silinecek. Hiçbir seride yazar olarak geçmiyor.',
  restrictDelete: false,
}

export default class AuthorController {
  async index({ view, request }: HttpContext) {
    const page = pageNumber(request.input('page'))
    const perPage = pageSize(request.input('per_page'))
    const search = searchText(request.input('q'))
    const authors = await Author.query()
      .withCount('series')
      .if(search, (query) => query.where('name', 'like', `%${search}%`))
      .orderBy('name', 'asc')
      .paginate(page, perPage)
    authors.baseUrl('/admin/yazarlar')
    authors.queryString({ per_page: perPage, ...(search ? { q: search } : {}) })
    return view.render('pages/admin/dictionary/index', {
      title: 'Yazarlar',
      dictionary,
      items: authors,
      paginator: authors,
      perPage,
      search,
    })
  }

  async create({ view }: HttpContext) {
    return view.render('pages/admin/dictionary/form', { title: 'Yeni Yazar Ekle', dictionary })
  }

  async store({ request, session, response }: HttpContext) {
    const data = await request.validateUsing(authorValidator)
    if (!slugify(data.name)) invalidField('name', 'Ad en az bir harf veya rakam içermeli.')
    const existing = await Author.query()
      .where('name', data.name)
      .orWhere('slug', slugify(data.name))
      .first()
    if (existing) {
      session.flashExcept(['_csrf', '_method'])
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
    const author = await Author.query().where('id', params.id).withCount('series').firstOrFail()
    return view.render('pages/admin/dictionary/form', {
      title: 'Yazar Düzenle',
      dictionary,
      item: author,
      usage: Number(author.$extras.series_count || 0),
    })
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
      session.flashExcept(['_csrf', '_method'])
      session.flash('error', 'Bu isimde başka bir yazar zaten mevcut')
      return response.redirect(`/admin/yazarlar/${author.id}/duzenle`)
    }
    author.name = data.name
    author.slug = slugify(data.name)
    author.updatedAt = now()
    await author.save()
    await refreshSearchText(await seriesOfPerson('author', author.id))
    session.flash('success', 'Yazar güncellendi')
    return response.redirect('/admin/yazarlar')
  }

  async destroy({ params, session, response }: HttpContext) {
    const author = await Author.findOrFail(params.id)
    try {
      const series = await seriesOfPerson('author', author.id)
      await author.delete()
      await refreshSearchText(series)
      session.flash('success', 'Yazar silindi')
    } catch {
      session.flash('error', 'Bu yazar serilere bağlı olduğu için silinemez')
    }
    return response.redirect('/admin/yazarlar')
  }
}
