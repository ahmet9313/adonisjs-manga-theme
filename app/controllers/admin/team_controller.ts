import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import teams, { teamRoleKeys } from '#config/teams'
import Team from '#models/team'
import teamService from '#services/team_service'
import { now, searchText, slugify } from '#services/input_service'
import { invalidField, removeContentFile, saveImage } from '#services/upload_service'
import { teamValidator } from '#validators/team'

/**
 * Admin → Topluluk → Ekipler (administrators only): translation teams, their members by role,
 * links, logo and recruitment notice. Editors only pick teams on the series and chapter forms.
 */
export default class TeamAdminController {
  async index({ view, request }: HttpContext) {
    const search = searchText(request.input('q'))
    return view.render('pages/admin/teams/index', {
      title: 'Ekipler',
      items: await teamService.adminList(search),
      search,
    })
  }

  async create({ view }: HttpContext) {
    return view.render('pages/admin/teams/form', {
      title: 'Yeni Ekip',
      team: null,
      members: Object.fromEntries(teamRoleKeys.map((role) => [role, []])),
      knownMembers: await teamService.knownMembers(),
      roles: teams.roles,
      links: teams.links,
    })
  }

  async edit({ view, params }: HttpContext) {
    const team = await Team.findOrFail(params.id)
    const [members, knownMembers] = await Promise.all([
      teamService.membersByRole(team.id),
      teamService.knownMembers(),
    ])
    return view.render('pages/admin/teams/form', {
      title: team.name,
      team,
      members,
      knownMembers,
      roles: teams.roles,
      links: teams.links,
    })
  }

  private async save(request: HttpContext['request'], team = new Team()) {
    const data = await request.validateUsing(teamValidator)
    const slug = team.$isPersisted ? team.slug : slugify(data.name)
    if (!slug) invalidField('name', 'Ekip adı en az bir harf veya rakam içermeli.')
    const duplicate = await Team.query()
      .where((query) => query.where('name', data.name).orWhere('slug', slug))
      .if(team.$isPersisted, (query) => query.whereNot('id', team.id))
      .first()
    if (duplicate) invalidField('name', 'Bu adda bir ekip zaten var.')
    const members = await teamService.parseMembers(
      Object.fromEntries(
        teamRoleKeys.map((role) => [role, (data as Record<string, any>)[`members_${role}`]])
      )
    )
    const upload = request.file('logo', teams.logoOptions)
    if (upload && !upload.isValid)
      invalidField('logo', 'Logo JPG, PNG veya WebP olmalı ve 2 MB sınırını aşmamalı.')
    const previous = team.logo
    const logo = upload
      ? await saveImage(upload, ['teams', slug])
      : data.remove_logo === 'on'
        ? null
        : team.logo || null
    const timestamp = now()
    try {
      await db.transaction(async (trx) => {
        team.useTransaction(trx)
        team.merge({
          name: data.name,
          slug,
          description: data.description || null,
          logo,
          recruiting: data.recruiting === 'on',
          recruitmentText: data.recruitment_text || null,
          discordUrl: data.discord_url || null,
          websiteUrl: data.website_url || null,
          otherUrl: data.other_url || null,
          createdAt: team.createdAt || timestamp,
          updatedAt: timestamp,
        })
        await team.save()
        await teamService.saveMembers(team.id, members, trx)
      })
    } catch (error) {
      // A logo uploaded with a save that failed is not kept.
      if (upload) await removeContentFile(logo)
      throw error
    }
    if (previous && previous !== logo) await removeContentFile(previous)
    return team
  }

  async store({ request, session, response }: HttpContext) {
    const team = await this.save(request)
    session.flash('success', `“${team.name}” ekibi eklendi`)
    return response.redirect('/admin/ekipler')
  }

  async update({ request, params, session, response }: HttpContext) {
    const team = await this.save(request, await Team.findOrFail(params.id))
    session.flash('success', `“${team.name}” ekibi güncellendi`)
    return response.redirect('/admin/ekipler')
  }

  /** Removes the team and its logo; series and chapters only lose the credit (cascade). */
  async destroy({ params, session, response }: HttpContext) {
    const team = await Team.findOrFail(params.id)
    await team.delete()
    await removeContentFile(team.logo)
    session.flash('success', `“${team.name}” ekibi silindi`)
    return response.redirect('/admin/ekipler')
  }
}
