import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import db from '@adonisjs/lucid/services/db'
import Cosmetic from '#models/cosmetic'
import User from '#models/user'
import cosmetics from '#services/cosmetic_service'
import notifications from '#services/notification_service'
import { invalidField, removeContentFile, saveImage } from '#services/upload_service'
import { now, pageNumber, slugify } from '#services/input_service'
import { badges } from '#config/rewards'
import { cosmeticKinds, gradientPattern, isKind, kindNames, presets } from '#config/cosmetics'

const imageRules = { size: '6mb', extnames: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }

const cosmeticValidator = vine.compile(
  vine.object({
    kind: vine.enum(kindNames),
    name: vine.string().trim().minLength(2).maxLength(60),
    preset: vine.string().trim().maxLength(40).optional(),
    colors: vine
      .array(vine.string().regex(/^#[0-9a-fA-F]{6}$/))
      .maxLength(3)
      .optional(),
    style_mode: vine.enum(['preset', 'gradient', 'image']),
    required_level: vine.number().withoutDecimals().range([1, 100]),
    required_badge: vine.string().trim().maxLength(40).optional(),
    grant_only: vine.enum(['on']).optional(),
    featured: vine.enum(['on']).optional(),
    active: vine.enum(['on']).optional(),
    remove_image: vine.enum(['on']).optional(),
    sort_order: vine.number().withoutDecimals().range([-9999, 9999]).optional(),
  })
)

const grantValidator = vine.compile(
  vine.object({ username: vine.string().trim().toLowerCase().minLength(3).maxLength(32) })
)

export default class CosmeticAdminController {
  private formData() {
    return {
      kinds: kindNames.map((name) => ({
        name,
        label: cosmeticKinds[name].label,
        plural: cosmeticKinds[name].plural,
        path: cosmeticKinds[name].path,
      })),
      presets,
      badges: badges.map((badge) => ({ slug: badge.slug, name: `${badge.icon} ${badge.name}` })),
    }
  }

  async index({ view, request }: HttpContext) {
    const kind = isKind(request.input('tur')) ? request.input('tur') : null
    const query = Cosmetic.query()
      .orderBy('kind', 'asc')
      .orderBy('sortOrder', 'asc')
      .orderBy('id', 'asc')
    if (kind) query.where('kind', kind)
    const items = await query.paginate(pageNumber(request.input('page')), 50)
    items.baseUrl('/admin/kozmetikler')
    if (kind) items.queryString({ tur: kind })
    // Item count of every kind for the tabs.
    const rows = await db.from('cosmetics').select('kind').count('* as total').groupBy('kind')
    const counts: Record<string, number> = Object.fromEntries(
      rows.map((row) => [String(row.kind), Number(row.total)])
    )
    return view.render('pages/admin/cosmetics/index', {
      title: 'Kozmetikler',
      items,
      paginator: items,
      kind,
      kinds: this.formData().kinds,
      counts,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      visual: (item: Cosmetic) => cosmetics.visual(item),
      lockText: (item: Cosmetic) => cosmetics.lockText(item),
    })
  }

  async create({ view, request }: HttpContext) {
    return view.render('pages/admin/cosmetics/form', {
      title: 'Yeni Kozmetik',
      kind: isKind(request.input('tur')) ? request.input('tur') : 'effect',
      ...this.formData(),
    })
  }

  async store({ request, session, response }: HttpContext) {
    const item = await this.save(request, new Cosmetic())
    session.flash('success', `${item.name} eklendi`)
    return response.redirect(`/admin/kozmetikler?tur=${item.kind}`)
  }

  async edit({ view, params }: HttpContext) {
    const item = await Cosmetic.findOrFail(params.id)
    const owners = await User.query()
      .whereIn('id', (query) =>
        query.from('user_cosmetics').where('cosmetic_id', item.id).select('user_id')
      )
      .orderBy('username')
      .limit(100)
    const [owned] = await db
      .from('user_cosmetics')
      .where('cosmetic_id', item.id)
      .count('* as total')
    return view.render('pages/admin/cosmetics/form', {
      title: 'Kozmetik Düzenle',
      item,
      kind: item.kind,
      owners,
      ownerCount: Number(owned.total),
      ...this.formData(),
    })
  }

  async update({ params, request, session, response }: HttpContext) {
    const item = await this.save(request, await Cosmetic.findOrFail(params.id))
    session.flash('success', `${item.name} güncellendi`)
    return response.redirect(`/admin/kozmetikler?tur=${item.kind}`)
  }

  async destroy({ params, session, response }: HttpContext) {
    const item = await Cosmetic.findOrFail(params.id)
    await cosmetics.detach(item)
    await item.delete()
    if (item.image?.startsWith('/content/')) await removeContentFile(item.image)
    cosmetics.invalidate()
    session.flash('success', `${item.name} silindi`)
    return response.redirect(`/admin/kozmetikler?tur=${item.kind}`)
  }

  /** Gives an item to a member (needed for gift-only items, optional for the rest). */
  async grant({ params, request, session, response }: HttpContext) {
    const item = await Cosmetic.findOrFail(params.id)
    const { username } = await request.validateUsing(grantValidator)
    const member = await User.findBy('username', username)
    if (!member) {
      session.flash('error', 'Kullanıcı bulunamadı')
      return response.redirect(`/admin/kozmetikler/${item.id}/duzenle`)
    }
    if (await cosmetics.grant(member.id, item.id)) {
      await notifications.notify(member.id, 'reward', {
        title: `Hediye: ${item.name}`,
        body: `${cosmeticKinds[item.kind].label} koleksiyonuna eklendi. Envanterinden kuşanabilirsin.`,
        link: `/kozmetik/${cosmeticKinds[item.kind].path}`,
      })
      session.flash('success', `${item.name}, @${member.username} hesabına verildi`)
    } else session.flash('info', 'Bu üye öğeye zaten sahip')
    return response.redirect(`/admin/kozmetikler/${item.id}/duzenle`)
  }

  private async save(request: HttpContext['request'], item: Cosmetic) {
    const data = await request.validateUsing(cosmeticValidator)
    const kind = data.kind
    let style: string | null = null
    const upload = request.file('image', imageRules)
    if (kind === 'sticker' || data.style_mode === 'image') {
      if (!upload && !item.image) invalidField('image', 'Bir görsel seçin.')
    } else if (data.style_mode === 'gradient') {
      style = `grad:${(data.colors ?? []).join(',')}`
      if (kind !== 'effect' || !gradientPattern.test(style))
        invalidField(
          'colors',
          'Özel renk geçişi yalnızca ad efektlerinde, 2-3 renkle kullanılabilir.'
        )
    } else {
      if (!data.preset || !(data.preset in presets[kind]))
        invalidField('preset', 'Bir hazır stil seçin.')
      style = data.preset
    }
    if (data.required_badge && !badges.some((badge) => badge.slug === data.required_badge))
      invalidField('required_badge', 'Rozet bulunamadı.')

    const previousImage = item.image
    const usesImage = kind === 'sticker' || data.style_mode === 'image'
    let image = usesImage ? item.image : null
    if (usesImage && upload) {
      if (!upload.isValid) invalidField('image', 'JPG, PNG, WebP veya GIF (en fazla 6 MB) seçin.')
      image = await saveImage(upload, ['cosmetics', kind])
    }

    const timestamp = now()
    if (!item.$isPersisted) {
      const base = `${kind}-${slugify(data.name) || 'oge'}`.slice(0, 70)
      let slug = base
      for (let index = 2; await Cosmetic.findBy('slug', slug); index++) slug = `${base}-${index}`
      item.slug = slug
      item.createdAt = timestamp
    }
    item.merge({
      kind,
      name: data.name,
      style: usesImage ? null : style,
      image,
      requiredLevel: data.required_level,
      requiredBadge: data.required_badge || null,
      grantOnly: data.grant_only === 'on',
      featured: data.featured === 'on',
      active: data.active === 'on',
      sortOrder: data.sort_order ?? 0,
      updatedAt: timestamp,
    })
    try {
      await item.save()
    } catch (error) {
      if (image !== previousImage) await removeContentFile(image)
      throw error
    }
    if (previousImage && previousImage !== image) await removeContentFile(previousImage)
    cosmetics.invalidate()
    return item
  }
}
