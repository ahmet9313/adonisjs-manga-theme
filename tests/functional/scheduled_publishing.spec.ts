import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import User from '#models/user'
import { now } from '#services/input_service'
import { localDay } from '#services/level'
import publishing, {
  addDays,
  fromLocalInput,
  releaseDaysOf,
  schedule,
  stampOf,
  weekdayOf,
} from '#services/publishing_service'
import { clearAttempts } from '#services/throttle'

const base = 'http://127.0.0.1:3334'
const password = 'schedule-password-123'
const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Cookie-aware client with form logins and CSRF form posts (JSON answers for 422s). */
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
  const page = (path: string) => request(path).then((response) => response.text())
  const token = (path: string) =>
    page(path).then((html) => html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || '')
  const post = async (path: string, fields: [string, string][], from: string, json = false) => {
    const body = new URLSearchParams([['_csrf', await token(from)], ...fields])
    return request(path, {
      method: 'POST',
      body,
      headers: json ? { accept: 'application/json' } : {},
    })
  }
  const login = async (identifier: string) => {
    const body = new URLSearchParams({ _csrf: await token('/giris'), login: identifier, password })
    return request('/giris', { method: 'POST', body })
  }
  return { request, page, post, login }
}

/** A datetime-local value (site time zone) `offset` ms from now. */
const inputIn = (offset: number) => schedule.input(stampOf(new Date(Date.now() + offset)))

test.group('Scheduled publishing and the release calendar', (group) => {
  let type: ContentType
  let open: Series
  let hidden: Series
  let reader: User

  const makeSeries = (slug: string, extra: Partial<Series> = {}) =>
    Series.create({
      title: `Takvim ${slug}`,
      slug,
      description: 'Test',
      contentTypeId: type.id,
      status: 'Devam Ediyor',
      translationStatus: 'Aktif',
      publicationYear: 2026,
      alternativeTitles: [],
      coverImage: '/images/no-cover.svg',
      featured: false,
      createdAt: '2020-01-01 00:00:00',
      updatedAt: '2020-01-01 00:00:00',
      ...extra,
    })
  const makeChapter = (owner: Series, number: number, extra: Partial<Chapter> = {}) =>
    Chapter.create({
      seriesId: owner.id,
      number,
      title: null,
      content: { type: 'text', text: `Metin ${number}` },
      publishedAt: '2020-01-01',
      createdAt: now(),
      updatedAt: now(),
      ...extra,
    })
  const notices = () =>
    db
      .from('notifications')
      .where({ user_id: reader.id, category: 'chapter' })
      .count('* as total')
      .then(([row]) => Number(row.total))

  group.setup(async () => {
    const timestamp = now()
    type = await ContentType.create({
      name: 'Takvim Metni',
      slug: 'takvim-metni',
      format: 'text',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    open = await makeSeries('takvim-acik')
    hidden = await makeSeries('takvim-gizli-seri', { draft: true })
    for (const [username, role] of [
      ['takvim_admin', 'admin'],
      ['takvim_okur', 'member'],
    ] as const)
      await User.create({
        username,
        email: `${username}@example.com`,
        fullName: username,
        password,
        role,
      })
    reader = await User.findByOrFail('username', 'takvim_okur')
    await db.table('bookmarks').insert([
      { user_id: reader.id, series_id: open.id, created_at: timestamp },
      { user_id: reader.id, series_id: hidden.id, created_at: timestamp },
    ])
  })

  group.each.setup(() => clearAttempts('login:127.0.0.1'))

  test('time helpers use the site time zone and weekday keys', ({ assert }) => {
    // Europe/Istanbul is UTC+3 all year.
    assert.equal(stampOf(new Date(fromLocalInput('2026-10-25T14:00')!)), '2026-10-25 11:00:00')
    assert.isNull(fromLocalInput('2026-02-30T10:00'))
    assert.isNull(fromLocalInput('yarın'))
    assert.equal(schedule.input('2026-10-25 11:00:00'), '2026-10-25T14:00')
    assert.equal(schedule.label('2026-10-25 11:00:00'), '25 Eki 14:00')
    assert.equal(weekdayOf('2026-10-23'), 'cum')
    assert.equal(addDays('2026-10-31', 1), '2026-11-01')
    assert.equal(releaseDaysOf(['paz', 'cum', 'xyz', 'cmt']), 'cum,cmt,paz')
    assert.isNull(releaseDaysOf([]))
    assert.equal(schedule.days('cum,cmt', 'Her cuma'), 'Cuma, Cumartesi · Her cuma')
  })

  test('forms plan drafts, refuse past times and save release days', async ({ assert }) => {
    const admin = client()
    await admin.login('takvim_admin')
    const chapterForm = `/admin/bolumler/ekle?series_id=${open.id}`
    const fields: [string, string][] = [
      ['series_id', String(open.id)],
      ['text_content', 'Planlı metin'],
    ]

    // A past time and a broken value are refused; nothing is stored.
    for (const value of [inputIn(-HOUR), 'yarın 10.00', inputIn(400 * DAY)]) {
      const refused = await admin.post(
        '/admin/bolumler/ekle',
        [...fields, ['number', '50'], ['draft', 'on'], ['publish_at', value]],
        chapterForm,
        true
      )
      assert.equal(refused.status, 422, value)
      const body = (await refused.json()) as { errors: { field: string }[] }
      assert.equal(body.errors[0].field, 'publish_at')
    }
    assert.isNull(await Chapter.query().where({ seriesId: open.id, number: 50 }).first())

    // A future time on a draft is stored as UTC; the list shows the "Planlı" badge.
    const planned = inputIn(2 * DAY)
    await admin.post(
      '/admin/bolumler/ekle',
      [...fields, ['number', '50'], ['draft', 'on'], ['publish_at', planned]],
      chapterForm
    )
    const chapter = await Chapter.query().where({ seriesId: open.id, number: 50 }).firstOrFail()
    assert.isTrue(chapter.draft)
    assert.equal(chapter.publishAt, stampOf(new Date(fromLocalInput(planned)!)))
    assert.include(
      await admin.page('/admin/bolumler'),
      `Planlı · ${schedule.label(chapter.publishAt)}`
    )
    const edit = await admin.page(`/admin/bolumler/${chapter.id}/duzenle`)
    assert.include(edit, `value="${planned}"`)
    assert.include(edit, 'Planlı yayın zamanı')

    // The dashboard lists it among the next planned publications.
    const dashboard = await admin.page('/admin')
    assert.include(dashboard, 'Planlı yayınlar')
    assert.include(dashboard, `/admin/bolumler/${chapter.id}/duzenle`)

    // Clearing the time keeps a plain draft; a published chapter never keeps a planned time.
    const editPath = `/admin/bolumler/${chapter.id}/duzenle`
    await admin.post(
      editPath,
      [...fields, ['number', '50'], ['draft', 'on'], ['publish_at', '']],
      editPath
    )
    await chapter.refresh()
    assert.isTrue(chapter.draft)
    assert.isNull(chapter.publishAt)
    await admin.post(editPath, [...fields, ['number', '50'], ['publish_at', planned]], editPath)
    await chapter.refresh()
    assert.isFalse(chapter.draft)
    assert.isNull(chapter.publishAt)
    assert.equal(chapter.publishedAt, localDay())
    await chapter.delete()
    await db.from('notifications').where({ user_id: reader.id }).delete()

    // Series form: planned time, normalised release days and a note.
    const seriesFields: [string, string][] = [
      ['title', 'Takvim Formu'],
      ['description', 'Form'],
      ['content_type_id', String(type.id)],
      ['status', 'Devam Ediyor'],
      ['translation_status', 'Aktif'],
      ['publication_year', '2026'],
      ['draft', 'on'],
      ['publish_at', planned],
      ['release_days[]', 'paz'],
      ['release_days[]', 'cum'],
      ['release_note', 'Her cuma 20.00’de'],
    ]
    await admin.post('/admin/seriler/ekle', seriesFields, '/admin/seriler/ekle')
    const series = await Series.findByOrFail('slug', 'takvim-formu')
    assert.isTrue(series.draft)
    assert.equal(series.publishAt, stampOf(new Date(fromLocalInput(planned)!)))
    assert.equal(series.releaseDays, 'cum,paz')
    assert.equal(series.releaseNote, 'Her cuma 20.00’de')
    assert.include(await admin.page('/admin/seriler'), 'Planlı · ')
    const unknownDay = await admin.post(
      `/admin/seriler/${series.id}/duzenle`,
      [...seriesFields.filter(([key]) => key !== 'release_days[]'), ['release_days[]', 'xyz']],
      `/admin/seriler/${series.id}/duzenle`,
      true
    )
    assert.equal(unknownDay.status, 422)
    await series.delete()
  })

  test('publishDue publishes due drafts once, like a manual publication', async ({ assert }) => {
    const at = new Date('2026-11-05T09:00:00Z')
    const due = await makeChapter(open, 60, { draft: true, publishAt: '2026-11-04 22:30:00' })
    const later = await makeChapter(open, 61, { draft: true, publishAt: '2026-11-05 10:00:00' })
    const plain = await makeChapter(open, 62, { draft: true })
    const quiet = await makeChapter(hidden, 1, { draft: true, publishAt: '2026-11-05 08:00:00' })
    const plannedSeries = await makeSeries('takvim-planli-seri', {
      draft: true,
      publishAt: '2026-11-05 08:59:00',
    })
    await db.from('notifications').where({ user_id: reader.id }).delete()

    // Not due yet: nothing changes.
    const early = await publishing.publishDue(new Date('2026-11-04T22:00:00Z'))
    assert.deepEqual(early, { series: 0, chapters: 0 })
    await due.refresh()
    assert.isTrue(due.draft)

    const result = await publishing.publishDue(at)
    assert.deepEqual(result, { series: 1, chapters: 2 })
    await Promise.all(
      [due, later, plain, quiet, plannedSeries, open, hidden].map((r) => r.refresh())
    )
    // 22:30 UTC on Nov 4 is 01:30 on Nov 5 in Istanbul: the chapter carries the scheduled day.
    assert.isFalse(due.draft)
    assert.isNull(due.publishAt)
    assert.equal(due.publishedAt, '2026-11-05')
    assert.equal(open.updatedAt, stampOf(at))
    assert.isTrue(later.draft)
    assert.isTrue(plain.draft)
    // A chapter of a draft series goes out silently; the series stays a draft.
    assert.isFalse(quiet.draft)
    assert.isTrue(hidden.draft)
    assert.isFalse(plannedSeries.draft)
    assert.isNull(plannedSeries.publishAt)
    assert.equal(plannedSeries.updatedAt, stampOf(at))
    assert.equal(await notices(), 1)
    const [notice] = await db.from('notifications').where({ user_id: reader.id })
    assert.include(notice.title, open.title)
    assert.equal(notice.link, `/series/${type.slug}/${open.slug}/60`)

    // Idempotent: a second run (or a second process) finds nothing to do.
    assert.deepEqual(await publishing.publishDue(at), { series: 0, chapters: 0 })
    assert.equal(await notices(), 1)

    // Two runs at once publish the next chapter exactly once.
    const both = await Promise.all([
      publishing.publishDue(new Date('2026-11-05T10:00:00Z')),
      publishing.publishDue(new Date('2026-11-05T10:00:00Z')),
    ])
    assert.equal(both[0].chapters + both[1].chapters, 1)
    assert.equal(await notices(), 2)

    await Promise.all([due, later, plain, quiet, plannedSeries].map((r) => r.delete()))
    await db.from('notifications').where({ user_id: reader.id }).delete()
  })

  test('series page shows release days; calendar lists plans without leaking drafts', async ({
    assert,
  }) => {
    const today = localDay()
    const tomorrow = addDays(today, 1)
    await open.merge({ releaseDays: weekdayOf(tomorrow), releaseNote: 'Akşam 8’de' }).save()
    const visitor = client()
    const seriesPage = await visitor.page(`/series/${type.slug}/${open.slug}`)
    assert.include(seriesPage, 'Yeni bölümler')
    assert.include(seriesPage, schedule.weekdays[weekdayOf(tomorrow)])
    assert.include(seriesPage, 'Akşam 8’de')

    // Tomorrow 15:00 site time: a planned chapter of a published series.
    const plannedStamp = stampOf(new Date(fromLocalInput(`${tomorrow}T15:00`)!))
    const planned = await makeChapter(open, 70, {
      draft: true,
      title: 'GİZLİ BAŞLIK',
      publishAt: plannedStamp,
    })
    const secret = await makeChapter(hidden, 5, { draft: true, publishAt: plannedStamp })
    const released = await makeChapter(open, 69, { title: 'Yeni çıkan', publishedAt: today })
    const hiddenReleased = await makeChapter(hidden, 4, { publishedAt: today })
    // An 18+ series: its cover in "Son 7 gün" follows the hidden-cover rule (blurred by default).
    const adult = await makeSeries('takvim-yetiskin', {
      ageRating: '18+',
      coverImage: '/content/takvim/kapak.jpg',
      releaseDays: 'pzt,sal,car,per,cum,cmt,paz',
    })
    const adultReleased = await makeChapter(adult, 1, { publishedAt: today })
    await hidden.merge({ releaseDays: 'pzt,sal,car,per,cum,cmt,paz' }).save()

    const response = await visitor.request('/takvim')
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.include(html, 'Yayın Takvimi')
    assert.include(html, 'Bölüm 70')
    assert.include(html, '15:00')
    assert.notInclude(html, `/series/${type.slug}/${open.slug}/70`)
    assert.notInclude(html, 'GİZLİ BAŞLIK')
    assert.include(html, 'Bu gün çıkanlar')
    // Released in the last 7 days, linked.
    assert.include(html, `/series/${type.slug}/${open.slug}/69`)
    // Draft series never appear: not planned, not released, not on weekdays.
    assert.notInclude(html, hidden.title)
    assert.notInclude(html, hidden.slug)
    assert.include(html, adult.title)
    assert.match(html, /takvim\/kapak\.jpg[^>]*data-veil="blur"/s)

    const month = await visitor.page('/takvim?gorunum=ay')
    assert.include(month, 'Önümüzdeki 30 gün')
    assert.include(month, 'Bölüm 70')
    assert.notInclude(month, hidden.slug)

    // Home and footer link to the calendar.
    const home = await visitor.page('/')
    assert.include(home, 'href="/takvim"')

    await Promise.all(
      [planned, secret, released, hiddenReleased, adultReleased].map((r) => r.delete())
    )
    await adult.delete()
    await open.merge({ releaseDays: null, releaseNote: null }).save()
    await hidden.merge({ releaseDays: null }).save()
  })
})
