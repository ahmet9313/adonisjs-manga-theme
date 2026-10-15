import type { HttpContext } from '@adonisjs/core/http'
import cosmetics from '#services/cosmetic_service'
import { cosmeticKinds, isKind, kindByPath, kindNames } from '#config/cosmetics'

const sorts = ['featured', 'level', 'popular', 'name'] as const

export default class CosmeticController {
  /** Collection pages: /kozmetik/cikartmalar, /cerceveler, /efektler, /duvar-kagitlari. */
  async index({ view, params, request, auth, response }: HttpContext) {
    const kind = kindByPath(String(params.kind))
    if (!kind) return response.status(404).send(await view.render('pages/errors/not_found'))
    const sort = sorts.find((item) => item === request.input('sirala')) ?? 'featured'
    const onlyUnlocked = request.input('acik') === '1'
    let items = await cosmetics.store(kind, auth.user ?? null)
    if (onlyUnlocked) items = items.filter((item) => item.unlocked)
    items.sort((a, b) => {
      if (sort === 'level') return (a.requiredLevel ?? 999) - (b.requiredLevel ?? 999)
      if (sort === 'popular') return b.users - a.users
      if (sort === 'name') return a.name.localeCompare(b.name, 'tr')
      return Number(b.featured) - Number(a.featured) || a.order - b.order
    })
    return view.render('pages/cosmetics/index', {
      title: cosmeticKinds[kind].plural,
      kind,
      info: cosmeticKinds[kind],
      kinds: kindNames.map((name) => ({ name, ...cosmeticKinds[name] })),
      items,
      sort,
      onlyUnlocked,
    })
  }

  async inventory({ auth }: HttpContext) {
    return cosmetics.inventory(auth.user!)
  }

  async equip({ params, auth, response }: HttpContext) {
    const result = await cosmetics.equip(auth.user!, Number(params.id))
    if ('error' in result) return response.unprocessableEntity(result)
    return result
  }

  async unequip({ params, auth, response }: HttpContext) {
    const kind = params.kind
    if (!isKind(kind) || kind === 'sticker')
      return response.unprocessableEntity({ error: 'Geçersiz tür.' })
    return cosmetics.unequip(auth.user!, kind)
  }
}
