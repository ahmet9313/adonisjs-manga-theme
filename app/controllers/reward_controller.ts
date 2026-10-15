import type { HttpContext } from '@adonisjs/core/http'
import progress from '#services/progress_service'
import cosmetics from '#services/cosmetic_service'
import { badges, cardDrops, exp } from '#config/rewards'
import { cosmeticKinds } from '#config/cosmetics'
import { expForLevel } from '#services/level'

export default class RewardController {
  /** "Günlük & Ödüller": level progress, EXP sources, check-in streak and upcoming unlocks. */
  async index({ view, auth }: HttpContext) {
    const user = auth.user!
    const level = user.level
    const catalog = await cosmetics.catalog()
    const upcoming = [...catalog.values()]
      .filter(
        (item) =>
          item.active && !item.grantOnly && !item.requiredBadge && item.requiredLevel > level
      )
      .sort((a, b) => a.requiredLevel - b.requiredLevel || a.sortOrder - b.sortOrder)
      .slice(0, 8)
      .map((item) => ({
        name: item.name,
        kind: cosmeticKinds[item.kind].label,
        level: item.requiredLevel,
        visual: cosmetics.visual(item),
        type: item.kind,
        expLeft: Math.max(0, expForLevel(item.requiredLevel) - user.exp),
      }))
    const week = Array.from({ length: 7 }, (_, index) => ({
      day: index + 1,
      exp: progress.checkinReward(index + 1),
      card: index + 1 === 7,
    }))
    return view.render('pages/rewards/index', {
      title: 'Seviye ve Ödüller',
      upcoming,
      cardChance: Math.round(cardDrops.readChance * 100),
      week,
      exp,
      badgeCount: badges.length,
    })
  }

  async checkin({ auth, request, response, session }: HttpContext) {
    const result = await progress.checkin(auth.user!)
    if (request.accepts(['html', 'json']) === 'json') return result
    session.flash(
      result.already ? 'info' : 'success',
      result.already
        ? 'Bugünkü girişini zaten aldın.'
        : `Günlük giriş: +${result.gained} EXP (seri: ${result.streak} gün)`
    )
    return response.redirect().back()
  }

  async badges({ view, auth }: HttpContext) {
    const board = await progress.badgeBoard(auth.user!)
    return view.render('pages/rewards/badges', {
      title: 'Rozetler',
      board,
      earned: board.filter((badge) => badge.earnedAt).length,
    })
  }
}
