import type { HttpContext } from '@adonisjs/core/http'
import cards from '#services/card_service'
import { isRarity, rarities, rarityRules } from '#config/rewards'

export default class CardController {
  async index({ view, auth }: HttpContext) {
    const collection = await cards.collection(auth.user!.id)
    return view.render('pages/cards/index', {
      title: 'Kartlar',
      collection,
      rules: rarities.map((rarity) => ({ rarity, ...rarityRules[rarity] })),
    })
  }

  async disassemble({ params, auth, response }: HttpContext) {
    const result = await cards.disassemble(auth.user!.id, Number(params.id))
    if (!result) return response.unprocessableEntity({ error: 'Parçalanacak kopya yok.' })
    return { ...result, shards: await cards.shards(auth.user!.id) }
  }

  async craft({ request, auth, response }: HttpContext) {
    const rarity = request.input('rarity')
    if (!isRarity(rarity)) return response.unprocessableEntity({ error: 'Geçersiz nadirlik.' })
    const result = await cards.craft(auth.user!.id, rarity)
    if ('error' in result) return response.unprocessableEntity(result)
    return { ...result, shards: await cards.shards(auth.user!.id) }
  }
}
