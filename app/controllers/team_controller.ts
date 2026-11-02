import type { HttpContext } from '@adonisjs/core/http'
import teams from '#config/teams'
import teamService from '#services/team_service'

/** Public team pages: /ekipler, /ekip/:slug and /ekibe-katil. */
export default class TeamController {
  async index({ view }: HttpContext) {
    return view.render('pages/teams/index', {
      title: 'Çeviri Ekipleri',
      description: 'Sitedeki serileri çeviren ekipler, üyeleri ve üye arayan ekipler.',
      items: await teamService.directory(),
    })
  }

  async show({ view, params, auth, response }: HttpContext) {
    const page = await teamService.page(String(params.slug || ''), auth.user)
    if (!page) {
      response.status(404)
      return view.render('pages/errors/not_found')
    }
    return view.render('pages/teams/show', {
      title: page.team.name,
      description:
        page.team.description || `${page.team.name} çeviri ekibinin serileri ve üyeleri.`,
      ...page,
    })
  }

  async recruit({ view }: HttpContext) {
    return view.render('pages/teams/recruit', {
      title: 'Ekibe Katıl',
      description: 'Çevirmen, redaktör, editör, temizleyici ve dizgici arayan çeviri ekipleri.',
      items: await teamService.recruiting(),
      roles: teams.roles,
    })
  }
}
