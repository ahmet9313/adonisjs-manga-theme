import { test } from '@japa/runner'
import { access as exists } from 'node:fs/promises'
import { join } from 'node:path'
import db from '@adonisjs/lucid/services/db'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import Team from '#models/team'
import User from '#models/user'
import content from '#config/content'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'

const base = 'http://127.0.0.1:3334'
const password = 'teams-password-123'
/** 1×1 transparent PNG. */
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)
const statusOf = (response: Promise<Response>) => response.then((result) => result.status)
/** Number of rows matching a query. */
const countOf = (query: Promise<any[]>) => query.then((rows) => Number(rows[0].n))
const onDisk = (publicPath: string) =>
  exists(join(content.root, ...publicPath.slice('/content/'.length).split('/'))).then(
    () => true,
    () => false
  )

type Fields = Record<string, string | string[]>

/** Cookie-aware client: form logins and CSRF form posts (urlencoded or multipart). */
function client() {
  const cookies = new Map<string, string>()
  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(base + path, {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: {
        cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...options.headers,
      },
    })
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';')
      const index = pair.indexOf('=')
      cookies.set(pair.slice(0, index), pair.slice(index + 1))
    }
    return response
  }
  const page = async (path: string) => {
    const response = await request(path)
    return response.text()
  }
  const token = async (from: string) =>
    page(from).then((html) => html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || '')
  /** Posts `fields` (arrays as name[]); `from` is the form page (CSRF token and referer). */
  const post = async (path: string, fields: Fields, from = '/giris') => {
    const body = new URLSearchParams({ _csrf: await token(from) })
    for (const [key, value] of Object.entries(fields))
      if (Array.isArray(value)) for (const item of value) body.append(`${key}[]`, item)
      else body.append(key, value)
    return request(path, { method: 'POST', body, headers: { referer: base + from } })
  }
  const upload = async (path: string, fields: Fields, file: Blob, from: string) => {
    const form = new FormData()
    form.append('_csrf', await token(from))
    for (const [key, value] of Object.entries(fields)) form.append(key, String(value))
    form.append('logo', file, 'logo.png')
    return request(path, { method: 'POST', body: form, headers: { referer: base + from } })
  }
  const login = (identifier: string) => post('/giris', { login: identifier, password })
  return { request, page, post, upload, login }
}

test.group('Translation teams, credits and recruitment', (group) => {
  let type: ContentType
  const series: Record<string, Series> = {}
  const chapters: Record<string, Chapter> = {}
  const users: Record<string, User> = {}

  group.setup(async () => {
    const timestamp = now()
    type = await ContentType.create({
      name: 'Ekip Metni',
      slug: 'ekip-metni',
      format: 'text',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const make = (slug: string, extra: Partial<Series> = {}) =>
      Series.create({
        title: `Ekip ${slug}`,
        slug,
        description: 'Test',
        contentTypeId: type.id,
        status: 'Devam Ediyor',
        translationStatus: 'Aktif',
        publicationYear: 2026,
        alternativeTitles: [],
        coverImage: '/images/no-cover.svg',
        featured: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...extra,
      }).then((created) => (series[slug] = created))
    await make('ekip-acik')
    await make('ekip-taslak', { draft: true })
    const chapter = (key: string, owner: Series, number: number, extra: Partial<Chapter> = {}) =>
      Chapter.create({
        seriesId: owner.id,
        number,
        title: `Bölüm adı ${key}`,
        content: { type: 'text', text: `METİN ${key}` },
        publishedAt: timestamp.slice(0, 10),
        createdAt: timestamp,
        updatedAt: timestamp,
        ...extra,
      }).then((created) => (chapters[key] = created))
    await chapter('first', series['ekip-acik'], 1)
    await chapter('second', series['ekip-acik'], 2)
    await chapter('hidden', series['ekip-acik'], 3, { draft: true, title: 'GİZLİ TASLAK BÖLÜM' })
    await chapter('draftSeries', series['ekip-taslak'], 1, { title: 'TASLAK SERİ BÖLÜMÜ' })
    for (const [username, role] of [
      ['ekip_admin', 'admin'],
      ['ekip_editor', 'editor'],
      ['ekip_uye', 'member'],
      ['Ekip_Cevirmen', 'member'],
      ['ekip_askida', 'member'],
    ] as const)
      users[username] = await User.create({
        username,
        email: `${username.toLowerCase()}@example.com`,
        fullName: username === 'Ekip_Cevirmen' ? 'Ayşe Çevirmen' : username,
        password,
        role,
      })
  })

  group.each.setup(() => clearAttempts())

  test('only administrators manage teams; links, names and usernames are validated', async ({
    assert,
  }) => {
    const editor = client()
    await editor.login('ekip_editor')
    assert.equal(await statusOf(editor.request('/admin/ekipler')), 403)
    const sneaky = await editor.post(
      '/admin/ekipler/ekle',
      { name: 'Editör Ekibi' },
      '/admin/seriler/ekle'
    )
    assert.equal(sneaky.status, 403)
    assert.isNull(await Team.findBy('name', 'Editör Ekibi'))
    const member = client()
    await member.login('ekip_uye')
    assert.notEqual(await statusOf(member.request('/admin/ekipler')), 200)

    const admin = client()
    await admin.login('ekip_admin')
    const list = await admin.page('/admin/ekipler')
    assert.include(list, 'Henüz ekip eklenmemiş')
    assert.include(await admin.page('/admin'), 'href="/admin/ekipler"')

    // javascript: links, unknown usernames and too short names are refused; nothing is stored.
    const bad = await admin.post(
      '/admin/ekipler/ekle',
      {
        name: 'Kötü Bağlantı',
        discord_url: 'javascript:alert(1)',
        members_translator: 'ekip_uye, yok_boyle_biri',
      },
      '/admin/ekipler/ekle'
    )
    assert.equal(bad.status, 302)
    assert.isNull(await Team.findBy('name', 'Kötü Bağlantı'))
    const form = await admin.page('/admin/ekipler/ekle')
    assert.include(form, 'http:// veya https:// ile başlayan')
    const unknown = await admin.post(
      '/admin/ekipler/ekle',
      { name: 'Bilinmeyen Üye', members_translator: 'ekip_uye, yok_boyle_biri' },
      '/admin/ekipler/ekle'
    )
    assert.equal(unknown.status, 302)
    assert.isNull(await Team.findBy('name', 'Bilinmeyen Üye'))
    assert.include(await admin.page('/admin/ekipler/ekle'), 'Kullanıcı bulunamadı: yok_boyle_biri')

    // A valid team: members by role (usernames case-insensitive, "@" allowed, order kept).
    const created = await admin.post(
      '/admin/ekipler/ekle',
      {
        name: 'Gece Kuşu Çeviri',
        description: 'Gece çalışan bir ekip.',
        discord_url: 'https://discord.gg/gecekusu',
        website_url: 'https://gecekusu.example.com',
        recruiting: 'on',
        recruitment_text: 'Korece çevirmen ve dizgici arıyoruz.',
        members_lead: 'ekip_admin',
        members_translator: '@ekip_cevirmen, ekip_askida',
        members_typesetter: 'ekip_uye',
      },
      '/admin/ekipler/ekle'
    )
    assert.equal(created.status, 302)
    assert.equal(created.headers.get('location'), '/admin/ekipler')
    const team = await Team.findByOrFail('name', 'Gece Kuşu Çeviri')
    assert.equal(team.slug, 'gece-kusu-ceviri')
    assert.isTrue(team.recruiting)
    const members = await db
      .from('team_members')
      .where('team_id', team.id)
      .orderBy('role')
      .orderBy('sort')
      .select('role', 'user_id', 'sort')
    assert.deepEqual(
      members.map((row) => [row.role, Number(row.user_id), Number(row.sort)]),
      [
        ['lead', users.ekip_admin.id, 0],
        ['translator', users.Ekip_Cevirmen.id, 0],
        ['translator', users.ekip_askida.id, 1],
        ['typesetter', users.ekip_uye.id, 0],
      ]
    )

    // Duplicate names are refused.
    await admin.post('/admin/ekipler/ekle', { name: 'Gece Kuşu Çeviri' }, '/admin/ekipler/ekle')
    assert.equal(
      await countOf(db.from('teams').where('name', 'Gece Kuşu Çeviri').count('* as n')),
      1
    )

    // Logo: signature checked, replaced files deleted, the edit form lists members.
    const editUrl = `/admin/ekipler/${team.id}/duzenle`
    const edit = await admin.page(editUrl)
    assert.include(edit, 'Ekip_Cevirmen')
    const fields = { name: 'Gece Kuşu Çeviri', members_lead: 'ekip_admin', recruiting: 'on' }
    const fake = await admin.upload(
      editUrl,
      fields,
      new Blob(['bu bir görsel değil'], { type: 'image/png' }),
      editUrl
    )
    assert.equal(fake.status, 302)
    await team.refresh()
    assert.isNull(team.logo)
    await admin.upload(
      editUrl,
      fields,
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      editUrl
    )
    await team.refresh()
    const firstLogo = team.logo!
    assert.match(firstLogo, /^\/content\/teams\/gece-kusu-ceviri\/[\w-]+\.png$/)
    assert.isTrue(await onDisk(firstLogo))
    await admin.upload(
      editUrl,
      fields,
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      editUrl
    )
    await team.refresh()
    assert.notEqual(team.logo, firstLogo)
    assert.isFalse(await onDisk(firstLogo))
    // Members were replaced by the edit (only the lead was posted).
    assert.equal(
      await countOf(db.from('team_members').where('team_id', team.id).count('* as n')),
      1
    )
    // Removing the logo deletes the file.
    const secondLogo = team.logo!
    await admin.post(editUrl, { ...fields, remove_logo: 'on' }, editUrl)
    await team.refresh()
    assert.isNull(team.logo)
    assert.isFalse(await onDisk(secondLogo))
  })

  test('series and chapters credit teams; chapters without their own fall back to the series', async ({
    assert,
  }) => {
    const timestamp = now()
    const [alpha, beta, gamma] = await Promise.all(
      ['Alfa Çeviri', 'Beta Scans', 'Gama Fansub'].map((name, index) =>
        Team.create({
          name,
          slug: ['alfa-ceviri', 'beta-scans', 'gama-fansub'][index],
          recruiting: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      )
    )
    const editor = client()
    await editor.login('ekip_editor')
    const open = series['ekip-acik']
    const seriesForm = `/admin/seriler/${open.id}/duzenle`
    assert.include(await editor.page(seriesForm), 'Çeviri ekibi')
    const seriesFields = {
      title: open.title,
      description: 'Test',
      content_type_id: String(type.id),
      status: 'Devam Ediyor',
      translation_status: 'Aktif',
      publication_year: '2026',
    }
    // Unknown team ids are refused.
    await editor.post(seriesForm, { ...seriesFields, teams: ['999999'] }, seriesForm)
    assert.lengthOf(await db.from('series_teams').where('series_id', open.id), 0)
    // Editors choose the series' teams (order kept).
    const saved = await editor.post(
      seriesForm,
      { ...seriesFields, teams: [String(beta.id), String(alpha.id)] },
      seriesForm
    )
    assert.equal(saved.headers.get('location'), '/admin/seriler')
    const seriesTeams = await db
      .from('series_teams')
      .where('series_id', open.id)
      .orderBy('sort')
      .select('team_id')
    assert.deepEqual(
      seriesTeams.map((row) => Number(row.team_id)),
      [beta.id, alpha.id]
    )

    // Chapter 2 gets its own team and a credit line.
    const chapterForm = `/admin/bolumler/${chapters.second.id}/duzenle`
    assert.include(await editor.page(chapterForm), 'Bu bölümün ekibi')
    const chapterSaved = await editor.post(
      chapterForm,
      {
        series_id: String(open.id),
        number: '2',
        title: 'Bölüm adı second',
        text_content: 'METİN second',
        teams: [String(gamma.id)],
        credits: 'Çeviri: Ayşe · Dizgi: Can',
      },
      chapterForm
    )
    assert.equal(chapterSaved.status, 302)
    await chapters.second.refresh()
    assert.equal(chapters.second.credits, 'Çeviri: Ayşe · Dizgi: Can')

    const reader = client()
    // Chapter 1 falls back to the series' teams.
    const first = await reader.page('/series/ekip-metni/ekip-acik/1')
    assert.match(first, /class="team-credit"/)
    assert.include(first, 'href="/ekip/beta-scans"')
    assert.include(first, 'href="/ekip/alfa-ceviri"')
    assert.isBelow(first.indexOf('/ekip/beta-scans'), first.indexOf('/ekip/alfa-ceviri'))
    assert.notInclude(first, '/ekip/gama-fansub')
    // Chapter 2 shows its own team and credit line, not the series'.
    const second = await reader.page('/series/ekip-metni/ekip-acik/2')
    assert.include(second, 'href="/ekip/gama-fansub"')
    assert.include(second, 'Çeviri: Ayşe · Dizgi: Can')
    assert.notInclude(second, 'href="/ekip/beta-scans"')

    // Series page: teams in the info box, the chapter's own team in its row.
    const seriesPage = await reader.page('/series/ekip-metni/ekip-acik')
    assert.include(seriesPage, 'Çeviri ekibi')
    assert.include(seriesPage, 'href="/ekip/beta-scans"')
    assert.match(seriesPage, /class="chapter-row__credit"[^>]*>Gama Fansub</)

    // Emptying the chapter's teams falls back again; deleting a team only detaches it.
    await editor.post(
      chapterForm,
      { series_id: String(open.id), number: '2', text_content: 'METİN second' },
      chapterForm
    )
    assert.include(await reader.page('/series/ekip-metni/ekip-acik/2'), 'href="/ekip/beta-scans"')
    const admin = client()
    await admin.login('ekip_admin')
    await admin.post(`/admin/ekipler/${beta.id}/sil`, {}, '/admin/ekipler')
    assert.isNull(await Team.find(beta.id))
    assert.isNotNull(await Series.find(open.id))
    const after = await reader.page('/series/ekip-metni/ekip-acik/1')
    assert.notInclude(after, '/ekip/beta-scans')
    assert.include(after, 'href="/ekip/alfa-ceviri"')
    // Editors cannot delete teams.
    const refused = await editor.post(`/admin/ekipler/${alpha.id}/sil`, {}, seriesForm)
    assert.equal(refused.status, 403)
  })

  test('team pages list members and published work only; recruitment page', async ({ assert }) => {
    const timestamp = now()
    const team = await Team.create({
      name: 'Sayfa Ekibi',
      slug: 'sayfa-ekibi',
      description: 'Herkese açık ekip açıklaması.',
      discordUrl: 'https://discord.gg/sayfa',
      recruiting: true,
      recruitmentText: 'Temizleyici arıyoruz!',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await Team.create({
      name: 'Sessiz Ekip',
      slug: 'sessiz-ekip',
      recruiting: false,
      recruitmentText: 'BU METİN GÖRÜNMEMELİ',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db.table('team_members').multiInsert([
      { team_id: team.id, user_id: users.Ekip_Cevirmen.id, role: 'translator', sort: 0 },
      { team_id: team.id, user_id: users.ekip_askida.id, role: 'cleaner', sort: 0 },
    ])
    users.ekip_askida.bannedAt = timestamp
    await users.ekip_askida.save()
    // The published series and the draft series both credit the team; one draft chapter too.
    await db.table('series_teams').multiInsert([
      { series_id: series['ekip-acik'].id, team_id: team.id, sort: 5 },
      { series_id: series['ekip-taslak'].id, team_id: team.id, sort: 0 },
    ])

    const visitor = client()
    const directory = await visitor.page('/ekipler')
    assert.include(directory, 'href="/ekip/sayfa-ekibi"')
    assert.include(directory, 'href="/ekip/sessiz-ekip"')
    assert.include(directory, 'Üye arıyor')
    assert.include(directory, 'href="/ekibe-katil"')

    const page = await visitor.page('/ekip/sayfa-ekibi')
    assert.include(page, '<h1 class="team-hero__title">Sayfa Ekibi</h1>')
    assert.include(page, 'Herkese açık ekip açıklaması.')
    assert.include(page, 'href="https://discord.gg/sayfa"')
    assert.include(page, 'href="/uye/Ekip_Cevirmen"')
    assert.include(page, 'Ayşe Çevirmen')
    assert.include(page, 'Temizleyici arıyoruz!')
    // Suspended members, draft series and draft chapters stay hidden.
    assert.notInclude(page, 'ekip_askida')
    assert.include(page, 'href="/series/ekip-metni/ekip-acik"')
    assert.notInclude(page, 'ekip-taslak')
    assert.notInclude(page, 'TASLAK SERİ BÖLÜMÜ')
    assert.notInclude(page, 'GİZLİ TASLAK BÖLÜM')
    assert.include(page, 'href="/series/ekip-metni/ekip-acik/1"')
    assert.include(page, '1 seri')
    assert.include(page, '1 üye')
    // Staff do not see drafts on public team pages either.
    const admin = client()
    await admin.login('ekip_admin')
    assert.notInclude(await admin.page('/ekip/sayfa-ekibi'), 'TASLAK SERİ BÖLÜMÜ')

    const quietPage = await visitor.page('/ekip/sessiz-ekip')
    assert.notInclude(quietPage, 'BU METİN GÖRÜNMEMELİ')
    assert.include(quietPage, 'Henüz seri yok')

    assert.equal(await statusOf(visitor.request('/ekip/boyle-bir-ekip-yok')), 404)

    const recruit = await visitor.page('/ekibe-katil')
    assert.include(recruit, 'Temizleyici arıyoruz!')
    assert.include(recruit, 'href="/ekip/sayfa-ekibi"')
    assert.include(recruit, 'Discord’dan başvur')
    assert.notInclude(recruit, 'Sessiz Ekip')
    assert.include(recruit, 'Dizgici')

    // The footer links to the team pages.
    assert.include(await visitor.page('/'), 'href="/ekipler"')
  })
})
