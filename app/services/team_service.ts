import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import teams, { teamLinkFields, teamRoleKeys, type TeamRole } from '#config/teams'
import SeriesModel from '#models/series'
import Team from '#models/team'
import type User from '#models/user'
import access from '#services/access_service'
import { coverView } from '#services/cover_policy_service'
import { invalidField } from '#services/upload_service'
import { calculateTimeAgo, serializeSeries } from '#services/series_presenter'
import type { AccessLevel } from '#config/site'

/** What credits and lists need of a team. */
export interface TeamRef {
  id: number
  name: string
  slug: string
  logo: string | null
}

/** Credit of one chapter: its own teams, else the series' (`inherited`), and the free text. */
export interface ChapterCredit {
  teams: TeamRef[]
  text: string | null
  inherited: boolean
}

type CreditTable = 'series_teams' | 'chapter_teams'
const ownerColumn: Record<CreditTable, string> = {
  series_teams: 'series_id',
  chapter_teams: 'chapter_id',
}

const refColumns = ['t.id', 't.name', 't.slug', 't.logo']
const refOf = (row: any): TeamRef => ({
  id: Number(row.id),
  name: row.name,
  slug: row.slug,
  logo: row.logo || null,
})

/** A team's links with their labels and icons (config/teams.ts), empty ones left out. */
export function teamLinks(team: Pick<Team, 'discordUrl' | 'websiteUrl' | 'otherUrl'>) {
  const values = {
    discord_url: team.discordUrl,
    website_url: team.websiteUrl,
    other_url: team.otherUrl,
  }
  return teamLinkFields
    .filter((field) => values[field])
    .map((field) => ({ ...teams.links[field], url: values[field] as string }))
}

/** "@Name", "name" → "name" (usernames are compared case-insensitively). */
const usernameOf = (value: string) => value.trim().replace(/^@/, '').toLowerCase()

class TeamService {
  /** Choices of the "Ekip" multi-selects (series and chapter forms). */
  async options() {
    const rows = await db.from('teams').select('id', 'name').orderBy('name', 'asc')
    return rows.map((row) => ({ id: Number(row.id), name: row.name as string }))
  }

  /** Posted team ids, unique and existing; anything else is a validation error on `field`. */
  async checkIds(raw: number[] | undefined, field = 'teams') {
    const ids = [...new Set(raw || [])]
    if (ids.length > teams.maxPerItem)
      invalidField(field, `En fazla ${teams.maxPerItem} ekip seçilebilir.`)
    if (!ids.length) return ids
    const found = await db.from('teams').whereIn('id', ids).select('id')
    if (found.length !== ids.length) invalidField(field, 'Seçilen ekip bulunamadı.')
    return ids
  }

  /** Replaces the teams of a series or chapter; the order of `ids` is kept. */
  async sync(table: CreditTable, ownerId: number, ids: number[], trx: TransactionClientContract) {
    const owner = ownerColumn[table]
    await trx.from(table).where(owner, ownerId).delete()
    if (ids.length)
      await trx
        .table(table)
        .multiInsert(ids.map((teamId, sort) => ({ [owner]: ownerId, team_id: teamId, sort })))
  }

  async idsOf(table: CreditTable, ownerId: number) {
    const rows = await db
      .from(table)
      .where(ownerColumn[table], ownerId)
      .orderBy('sort', 'asc')
      .select('team_id')
    return rows.map((row) => Number(row.team_id))
  }

  private seriesTeams(seriesId: number) {
    return db
      .from('series_teams as st')
      .join('teams as t', 't.id', 'st.team_id')
      .where('st.series_id', seriesId)
      .orderBy('st.sort', 'asc')
      .select(refColumns)
      .then((rows) => rows.map(refOf))
  }

  /**
   * Series page: the series' teams and every chapter's own credit, keyed by chapter number.
   * Rows only exist for chapters with their own teams or text (the rest fall back to `teams`).
   */
  async seriesCredits(seriesId: number) {
    const [own, chapterTeams, texts] = await Promise.all([
      this.seriesTeams(seriesId),
      db
        .from('chapter_teams as x')
        .join('chapters as c', 'c.id', 'x.chapter_id')
        .join('teams as t', 't.id', 'x.team_id')
        .where('c.series_id', seriesId)
        .orderBy('x.sort', 'asc')
        .select(['c.number', ...refColumns]),
      db
        .from('chapters')
        .where('series_id', seriesId)
        .whereNotNull('credits')
        .whereNot('credits', '')
        .select('number', 'credits'),
    ])
    const chapters: Record<number, { teams: TeamRef[]; text: string | null }> = {}
    const entry = (number: number) => (chapters[number] ??= { teams: [], text: null })
    for (const row of chapterTeams) entry(Number(row.number)).teams.push(refOf(row))
    for (const row of texts) entry(Number(row.number)).text = row.credits
    return { teams: own, chapters }
  }

  /** Reader header: the chapter's teams (else the series'), plus its credit text; null if none. */
  async chapterCredit(seriesId: number, chapterId: number): Promise<ChapterCredit | null> {
    const [own, row] = await Promise.all([
      db
        .from('chapter_teams as x')
        .join('teams as t', 't.id', 'x.team_id')
        .where('x.chapter_id', chapterId)
        .orderBy('x.sort', 'asc')
        .select(refColumns)
        .then((rows) => rows.map(refOf)),
      db.from('chapters').where('id', chapterId).select('credits').first(),
    ])
    const inherited = !own.length
    const list = inherited ? await this.seriesTeams(seriesId) : own
    const text = (row?.credits as string | null)?.trim() || null
    if (!list.length && !text) return null
    return { teams: list, text, inherited }
  }

  /** Usernames per role for the admin form, in the stored order. */
  async membersByRole(teamId: number) {
    const rows = await db
      .from('team_members as m')
      .join('users as u', 'u.id', 'm.user_id')
      .where('m.team_id', teamId)
      .orderBy('m.sort', 'asc')
      .orderBy('m.id', 'asc')
      .select('m.role', 'u.username')
    const byRole = Object.fromEntries(teamRoleKeys.map((role) => [role, [] as string[]]))
    for (const row of rows) byRole[row.role]?.push(row.username)
    return byRole as Record<TeamRole, string[]>
  }

  /**
   * Members posted as one comma separated username list per role (`members_<role>`). Unknown
   * usernames are a validation error on that field; returns the rows to store.
   */
  async parseMembers(fields: Partial<Record<TeamRole, string | undefined>>) {
    const lists = teamRoleKeys.map((role) => {
      const names = [
        ...new Set(
          String(fields[role] || '')
            .split(',')
            .map(usernameOf)
            .filter(Boolean)
        ),
      ]
      if (names.length > teams.maxMembersPerRole)
        invalidField(
          `members_${role}`,
          `Bir görevde en fazla ${teams.maxMembersPerRole} kişi olabilir.`
        )
      return { role, names }
    })
    const all = [...new Set(lists.flatMap((list) => list.names))]
    const users = all.length
      ? await db.from('users').whereIn(db.raw('LOWER(username)'), all).select('id', 'username')
      : []
    const byName = new Map(users.map((user) => [String(user.username).toLowerCase(), user]))
    const rows: { user_id: number; role: TeamRole; sort: number }[] = []
    for (const { role, names } of lists) {
      const missing = names.filter((name) => !byName.has(name))
      if (missing.length)
        invalidField(`members_${role}`, `Kullanıcı bulunamadı: ${missing.join(', ')}`)
      names.forEach((name, sort) =>
        rows.push({ user_id: Number(byName.get(name)!.id), role, sort })
      )
    }
    return rows
  }

  async saveMembers(
    teamId: number,
    rows: { user_id: number; role: TeamRole; sort: number }[],
    trx: TransactionClientContract
  ) {
    await trx.from('team_members').where('team_id', teamId).delete()
    if (rows.length)
      await trx.table('team_members').multiInsert(rows.map((row) => ({ ...row, team_id: teamId })))
  }

  /** Usernames that already serve in a team: suggestions of the member fields. */
  async knownMembers() {
    const rows = await db
      .from('team_members as m')
      .join('users as u', 'u.id', 'm.user_id')
      .distinct('u.username')
      .orderBy('u.username', 'asc')
      .limit(200)
    return rows.map((row) => row.username as string)
  }

  /** Admin list: teams with member and credit counts (drafts included; this is the panel). */
  async adminList(search: string) {
    const list = await Team.query()
      .if(search, (query) => query.where('name', 'like', `%${search}%`))
      .orderBy('name', 'asc')
    return this.withCounts(list, { drafts: true })
  }

  /**
   * People and published series per team. A series counts when it is one of the team's default
   * series or one of its published chapters credits the team.
   */
  private async withCounts(list: Team[], { drafts = false } = {}) {
    const ids = list.map((team) => team.id)
    if (!ids.length) return []
    const [members, series] = await Promise.all([
      db
        .from('team_members as m')
        .join('users as u', 'u.id', 'm.user_id')
        .whereIn('m.team_id', ids)
        .whereNull('u.banned_at')
        .select('m.team_id', 'm.user_id'),
      this.creditedSeries(ids, { drafts }),
    ])
    const count = (rows: any[], key: string) => {
      const sets = new Map<number, Set<number>>()
      for (const row of rows) {
        const team = Number(row.team_id)
        if (!sets.has(team)) sets.set(team, new Set())
        sets.get(team)!.add(Number(row[key]))
      }
      return (team: number) => sets.get(team)?.size || 0
    }
    const memberCount = count(members, 'user_id')
    const seriesCount = count(series, 'series_id')
    return list.map((team) => ({
      team,
      links: teamLinks(team),
      memberCount: memberCount(team.id),
      seriesCount: seriesCount(team.id),
    }))
  }

  /** (team_id, series_id) pairs: default teams plus explicit chapter credits. */
  private async creditedSeries(teamIds: number[], { drafts = false } = {}) {
    const [defaults, chapters] = await Promise.all([
      db
        .from('series_teams as st')
        .join('series as s', 's.id', 'st.series_id')
        .whereIn('st.team_id', teamIds)
        .if(!drafts, (query) => query.where('s.draft', false))
        .select('st.team_id', 'st.series_id'),
      db
        .from('chapter_teams as x')
        .join('chapters as c', 'c.id', 'x.chapter_id')
        .join('series as s', 's.id', 'c.series_id')
        .whereIn('x.team_id', teamIds)
        .if(!drafts, (query) => query.where('s.draft', false).where('c.draft', false))
        .distinct('x.team_id', 'c.series_id as series_id'),
    ])
    return [...defaults, ...chapters]
  }

  /** /ekipler: every team, recruiting ones first. */
  async directory() {
    const list = await Team.query().orderBy('recruiting', 'desc').orderBy('name', 'asc')
    return this.withCounts(list)
  }

  /** /ekibe-katil: recruiting teams with their notice. */
  async recruiting() {
    const list = await Team.query().where('recruiting', true).orderBy('name', 'asc')
    return this.withCounts(list)
  }

  /**
   * /ekip/:slug: the team, its members by role (suspended accounts left out), the published
   * series it works on and its latest published chapters. Locked chapters are listed with their
   * access level like on series pages; drafts never.
   */
  async page(slug: string, viewer: User | null | undefined) {
    const team = await Team.findBy('slug', slug)
    if (!team) return null
    const [memberRows, pairs] = await Promise.all([
      db
        .from('team_members as m')
        .join('users as u', 'u.id', 'm.user_id')
        .where('m.team_id', team.id)
        .whereNull('u.banned_at')
        .orderBy('m.sort', 'asc')
        .orderBy('m.id', 'asc')
        .select('m.role', 'u.id', 'u.username', 'u.full_name', 'u.avatar'),
      this.creditedSeries([team.id]),
    ])
    const roles = teamRoleKeys
      .map((role) => ({
        role,
        label: teams.roles[role].plural,
        people: memberRows
          .filter((row) => row.role === role)
          .map((row) => ({
            id: Number(row.id),
            username: row.username as string,
            fullName: (row.full_name as string) || '',
            avatar: (row.avatar as string | null) || null,
          })),
      }))
      .filter((group) => group.people.length)
    const seriesIds = [...new Set(pairs.map((row) => Number(row.series_id)))]
    const seriesRows = seriesIds.length
      ? await SeriesModel.query()
          .whereIn('id', seriesIds)
          .where('draft', false)
          .preload('contentType')
          .preload('genres')
          .orderBy('updatedAt', 'desc')
      : []
    const series = seriesRows.map(serializeSeries)
    return {
      team,
      links: teamLinks(team),
      roles,
      memberCount: new Set(memberRows.map((row) => Number(row.id))).size,
      series,
      chapters: await this.latestChapters(team.id, viewer),
    }
  }

  /** Newest published chapters credited to the team (own credit, or the series' default teams). */
  private async latestChapters(teamId: number, viewer: User | null | undefined) {
    const rows = await db
      .from('chapters as c')
      .join('series as s', 's.id', 'c.series_id')
      .join('content_types as ct', 'ct.id', 's.content_type_id')
      .where('s.draft', false)
      .where('c.draft', false)
      .where((query) =>
        query
          .whereExists((sub) =>
            sub
              .from('chapter_teams as x')
              .whereRaw('x.chapter_id = c.id')
              .where('x.team_id', teamId)
          )
          .orWhere((fallback) =>
            fallback
              .whereNotExists((sub) =>
                sub.from('chapter_teams as y').whereRaw('y.chapter_id = c.id')
              )
              .whereExists((sub) =>
                sub
                  .from('series_teams as z')
                  .whereRaw('z.series_id = c.series_id')
                  .where('z.team_id', teamId)
              )
          )
      )
      .orderBy('c.published_at', 'desc')
      .orderBy('c.id', 'desc')
      .limit(teams.latestChapters)
      .select(
        'c.number',
        'c.title',
        'c.published_at',
        'c.access',
        's.title as series_title',
        's.slug',
        's.access as series_access',
        's.cover_image',
        's.age_rating',
        's.cover_mode',
        'ct.slug as type',
        'ct.format'
      )
    return rows.map((row) => {
      const lock = access.effectiveAccess({
        series: { draft: false, access: row.series_access as AccessLevel, ageRating: null },
        chapter: { access: row.access as AccessLevel },
      })
      return {
        number: Number(row.number),
        title: (row.title as string | null) || null,
        publishedAt: row.published_at as string,
        timeAgo: calculateTimeAgo(row.published_at),
        url: `/series/${row.type}/${row.slug}/${row.number}`,
        seriesTitle: row.series_title as string,
        seriesUrl: `/series/${row.type}/${row.slug}`,
        video: row.format === 'video',
        lock: lock === 'public' ? null : lock,
        open: access.allows(viewer, lock),
        ...coverView({
          coverImage: row.cover_image,
          ageRating: row.age_rating,
          coverMode: row.cover_mode,
        }),
      }
    })
  }
}

export default new TeamService()
