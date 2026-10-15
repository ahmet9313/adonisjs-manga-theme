import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import db from '@adonisjs/lucid/services/db'
import Card from '#models/card'
import SeriesModel from '#models/series'
import cards from '#services/card_service'
import { invalidField, removeContentFile, saveImage } from '#services/upload_service'
import { now, pageNumber } from '#services/input_service'
import { isRarity, rarities, rarityRules } from '#config/rewards'

const imageRules = { size: '6mb', extnames: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }

const cardValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(80),
    rarity: vine.enum([...rarities]),
    series_id: vine.number().positive().withoutDecimals().optional(),
    active: vine.enum(['on']).optional(),
  })
)

export default class CardAdminController {
  private async formData() {
    return {
      rarities: rarities.map((rarity) => ({ rarity, label: rarityRules[rarity].label })),
      seriesList: await SeriesModel.query()
        .select('id', 'title', 'coverImage')
        .orderBy('title', 'asc'),
    }
  }

  async index({ view, request }: HttpContext) {
    const rarity = isRarity(request.input('nadirlik')) ? request.input('nadirlik') : null
    const query = Card.query().preload('series').orderBy('id', 'desc')
    if (rarity) query.where('rarity', rarity)
    const items = await query.paginate(pageNumber(request.input('page')), 48)
    items.baseUrl('/admin/kartlar')
    if (rarity) items.queryString({ nadirlik: rarity })
    const [row] = await db
      .from('series')
      .whereNotIn('id', (sub) => sub.from('cards').whereNotNull('series_id').select('series_id'))
      .count('* as total')
    return view.render('pages/admin/cards/index', {
      title: 'Kartlar',
      items,
      paginator: items,
      rarity,
      rarities,
      missingSeries: Number(row.total),
    })
  }

  async create({ view }: HttpContext) {
    return view.render('pages/admin/cards/form', { title: 'Yeni Kart', ...(await this.formData()) })
  }

  async store({ request, session, response }: HttpContext) {
    await this.save(request, new Card())
    session.flash('success', 'Kart eklendi')
    return response.redirect('/admin/kartlar')
  }

  async edit({ view, params }: HttpContext) {
    const card = await Card.findOrFail(params.id)
    return view.render('pages/admin/cards/form', {
      title: 'Kart Düzenle',
      card,
      ...(await this.formData()),
    })
  }

  async update({ params, request, session, response }: HttpContext) {
    await this.save(request, await Card.findOrFail(params.id))
    session.flash('success', 'Kart güncellendi')
    return response.redirect('/admin/kartlar')
  }

  async destroy({ params, session, response }: HttpContext) {
    const card = await Card.findOrFail(params.id)
    await card.delete()
    if (card.image.startsWith('/content/cards/')) await removeContentFile(card.image)
    session.flash('success', 'Kart silindi')
    return response.redirect('/admin/kartlar')
  }

  async generate({ session, response }: HttpContext) {
    const created = await cards.createFromSeries()
    session.flash(
      created ? 'success' : 'info',
      created ? `${created} kart seri kapaklarından oluşturuldu` : 'Kartı olmayan kapaklı seri yok'
    )
    return response.redirect('/admin/kartlar')
  }

  private async save(request: HttpContext['request'], card: Card) {
    const data = await request.validateUsing(cardValidator)
    const series = data.series_id ? await SeriesModel.find(data.series_id) : null
    if (data.series_id && !series) invalidField('series_id', 'Seri bulunamadı.')
    const upload = request.file('image', imageRules)
    const previous = card.image
    let image = card.image
    if (upload) {
      if (!upload.isValid) invalidField('image', 'JPG, PNG, WebP veya GIF (en fazla 6 MB) seçin.')
      image = await saveImage(upload, ['cards'])
    } else if (!image) {
      if (!series?.coverImage)
        invalidField('image', 'Bir görsel seçin ya da kapağı olan bir seri bağlayın.')
      image = series.coverImage
    }
    const timestamp = now()
    card.merge({
      name: data.name,
      rarity: data.rarity,
      seriesId: series?.id ?? null,
      image,
      active: data.active === 'on',
      createdAt: card.createdAt || timestamp,
      updatedAt: timestamp,
    })
    try {
      await card.save()
    } catch (error) {
      if (image !== previous)
        await removeContentFile(image?.startsWith('/content/cards/') ? image : null)
      throw error
    }
    if (previous && previous !== image && previous.startsWith('/content/cards/'))
      await removeContentFile(previous)
  }
}
