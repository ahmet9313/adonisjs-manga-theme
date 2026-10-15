import { invalidField } from '#services/upload_service'
import { now, slugify, pageNumber, pageSize, searchText } from '#services/input_service'
import type { HttpContext } from '@adonisjs/core/http'
import ContentType from '#models/content_type'
import vine from '@vinejs/vine'

const contentTypeValidator = vine.compile(
  vine.object({ name: vine.string().trim().minLength(1).maxLength(50) })
)

/**
 * Labels of the shared dictionary pages (pages/admin/dictionary/*). A content type that series
 * use cannot be deleted (the foreign key restricts it), so the list disables its delete button.
 */
const dictionary = {
  label: 'İçerik Türleri',
  singular: 'İçerik türü',
  base: '/admin/icerik-turleri',
  description:
    'Manga, manhwa, novel gibi biçimler. Seri ve bölüm adreslerinde kullanılır; novel türündeki bölümler metin olarak yazılır.',
  nameLabel: 'İçerik türü adı',
  placeholder: 'ör. manga',
  maxLength: 50,
  addLabel: 'İçerik türü ekle',
  slugNote:
    'Adres (slug) yalnız eklerken oluşturulur ve sonra değişmez; seri ve bölüm adresleri bu değeri kullanır.',
  catalogParam: 'type',
  catalogField: 'slug',
  emptyTitle: 'Henüz içerik türü eklenmemiş',
  emptyText: 'Seri ekleyebilmek için en az bir içerik türü gerekir.',
  deleteTitle: 'İçerik türü silinsin mi?',
  deleteUsed: '',
  deleteUnused: 'içerik türü silinecek. Bu türü kullanan seri yok.',
  restrictDelete: true,
  restrictNote: 'Bu türü {n} seri kullanıyor; önce serileri başka bir türe taşıyın.',
}

export default class ContentTypeController {
  async index({ view, request }: HttpContext) {
    const page = pageNumber(request.input('page'))
    const perPage = pageSize(request.input('per_page'))
    const search = searchText(request.input('q'))
    const contentTypes = await ContentType.query()
      .withCount('series')
      .if(search, (query) => query.where('name', 'like', `%${search}%`))
      .orderBy('name', 'asc')
      .paginate(page, perPage)
    contentTypes.baseUrl('/admin/icerik-turleri')
    contentTypes.queryString({ per_page: perPage, ...(search ? { q: search } : {}) })
    return view.render('pages/admin/dictionary/index', {
      title: 'İçerik Türleri',
      dictionary,
      items: contentTypes,
      paginator: contentTypes,
      perPage,
      search,
    })
  }

  async create({ view }: HttpContext) {
    return view.render('pages/admin/dictionary/form', {
      title: 'Yeni İçerik Türü Ekle',
      dictionary,
    })
  }

  async store({ request, session, response }: HttpContext) {
    const data = await request.validateUsing(contentTypeValidator)
    if (!slugify(data.name)) invalidField('name', 'Ad en az bir harf veya rakam içermeli.')
    const existing = await ContentType.query()
      .where('name', data.name)
      .orWhere('slug', slugify(data.name))
      .first()
    if (existing) {
      session.flashExcept(['_csrf', '_method'])
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
    const contentType = await ContentType.query()
      .where('id', params.id)
      .withCount('series')
      .firstOrFail()
    return view.render('pages/admin/dictionary/form', {
      title: 'İçerik Türü Düzenle',
      dictionary,
      item: contentType,
      usage: Number(contentType.$extras.series_count || 0),
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
      session.flashExcept(['_csrf', '_method'])
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
