import { test } from '@japa/runner'
import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'
import db from '@adonisjs/lucid/services/db'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import User from '#models/user'
import AdminLog from '#models/admin_log'
import content from '#config/content'
import adminTools from '#config/admin_tools'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'
import adminLog from '#services/admin_log_service'
import {
  naturalCompare,
  parseChapterName,
  planZip,
  imageKindOf,
} from '#services/bulk_upload_service'

const base = 'http://127.0.0.1:3334'
const password = 'tools-password-123'
const old = '2020-01-01 00:00:00'

const png = (marker: number) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, marker),
  ])
const jpg = (marker: number) =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, marker)])

interface ZipFileSpec {
  name: string
  data?: Buffer
  deflate?: boolean
  /** Lie about the inflated size (zip bomb). */
  claimedSize?: number
}

/** Minimal ZIP writer (stored or deflated entries, UTF-8 names); accepts any name, even `../`. */
function makeZip(files: ZipFileSpec[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const data = file.data ?? Buffer.alloc(0)
    const body = file.deflate ? deflateRawSync(data) : data
    const method = file.deflate ? 8 : 0
    const size = file.claimedSize ?? data.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0x21, 12)
    local.writeUInt32LE(crc32(data), 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, body)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0x21, 14)
    central.writeUInt32LE(crc32(data), 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += local.length + name.length + body.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

/** Small awaits without reading members of an await expression (lint rule). */
const statusOf = async (response: Promise<Response>) => {
  const result = await response
  return result.status
}
const textOf = async (response: Promise<Response>) => {
  const result = await response
  return result.text()
}
const jsonOf = async <T>(response: Promise<Response>) => {
  const result = await response
  return (await result.json()) as T
}
const updatedOf = async (id: number) => {
  const row = await Series.findOrFail(id)
  return row.updatedAt
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false
  )
const diskPath = (publicPath: string) =>
  join(content.root, ...publicPath.slice('/content/'.length).split('/'))

function client() {
  const cookies = new Map<string, string>()
  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(base + path, {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
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
  const page = async (path: string) => textOf(request(path))
  const formToken = async (path: string) =>
    page(path).then((html) => html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || '')
  const csrf = async (path = '/') =>
    page(path).then((html) => html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || '')
  const login = async (identifier: string) =>
    request('/giris', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await formToken('/giris'), login: identifier, password }),
    })
  const post = async (path: string, fields: Record<string, string>) =>
    request(path, {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await formToken('/admin'), ...fields }),
    })
  const uploadZip = async (seriesId: number, bytes: Buffer, name = 'arsiv.zip') => {
    const form = new FormData()
    form.append('zip', new Blob([new Uint8Array(bytes)], { type: 'application/zip' }), name)
    return request(`/admin/toplu-yukle/arsiv?series_id=${seriesId}`, {
      method: 'POST',
      body: form,
      headers: { 'accept': 'application/json', 'x-csrf-token': await csrf('/admin') },
    })
  }
  const json = async (path: string, body: unknown) =>
    request(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'x-csrf-token': await csrf('/admin'),
      },
    })
  return { request, page, login, post, uploadZip, json }
}

interface Preview {
  token: string
  flat: boolean
  warnings: string[]
  ignored: number
  suggestedNumber: number
  existing: number[]
  chapters: {
    key: string
    number: number | null
    title: string | null
    pageCount: number
    importable: boolean
    warnings: string[]
    firstPage: string
    lastPage: string
  }[]
}

test.group('Admin tools: ZIP planning', () => {
  test('chapter names give numbers and titles; decimals are flagged', ({ assert }) => {
    assert.deepEqual(parseChapterName('12'), { number: 12, title: null, fractional: false })
    assert.deepEqual(parseChapterName('012'), { number: 12, title: null, fractional: false })
    assert.deepEqual(parseChapterName('Bölüm 12 - Yeni Başlangıç'), {
      number: 12,
      title: 'Yeni Başlangıç',
      fractional: false,
    })
    assert.deepEqual(parseChapterName('Chapter 7: The End'), {
      number: 7,
      title: 'The End',
      fractional: false,
    })
    assert.equal(parseChapterName('Vol.2 Ch.15 Kaçış').number, 15)
    assert.equal(parseChapterName('Vol.2 Ch.15 Kaçış').title, 'Kaçış')
    assert.isTrue(parseChapterName('12.5 Ekstra').fractional)
    assert.isNull(parseChapterName('12.5').number)
    assert.isNull(parseChapterName('Sonsöz').number)
    assert.equal(parseChapterName('Bölüm 3.zip').number, 3)
  })

  test('natural order and image signatures', ({ assert }) => {
    assert.deepEqual(['10.jpg', '2.jpg', '1.jpg', 'a/3.jpg'].sort(naturalCompare), [
      '1.jpg',
      '2.jpg',
      '10.jpg',
      'a/3.jpg',
    ])
    assert.equal(imageKindOf(png(1)), 'png')
    assert.equal(imageKindOf(jpg(1)), 'jpg')
    assert.equal(imageKindOf(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')), 'webp')
    assert.isNull(imageKindOf(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')))
  })

  test('folders become chapters; wrappers, junk and loose files are handled', ({ assert }) => {
    const item = (name: string, kind: 'png' | null = 'png') => ({ name, size: 100, kind })
    const plan = planZip([
      item('Seri/Bölüm 1 - Başlangıç/10.png'),
      item('Seri/Bölüm 1 - Başlangıç/2.png'),
      item('Seri/Bölüm 1 - Başlangıç/1.png'),
      item('Seri/2/sayfalar/01.png'),
      item('Seri/2.5/01.png'),
      item('Seri/Ekstra/01.png'),
      item('Seri/kapak.png'),
      item('Seri/notlar.txt', null),
      item('Seri/2/bozuk.png', null),
      item('__MACOSX/Seri/._1.png', null),
      item('Seri/.DS_Store', null),
      item('Seri/2/Thumbs.db', null),
    ])
    assert.isFalse(plan.flat)
    assert.equal(plan.ignored, 3)
    assert.deepEqual(
      plan.chapters.map((chapter) => [chapter.key, chapter.number, chapter.importable]),
      [
        ['Bölüm 1 - Başlangıç', 1, true],
        ['2', 2, true],
        ['2.5', null, false],
        ['Ekstra', null, false],
      ]
    )
    const first = plan.chapters.find((chapter) => chapter.number === 1)!
    assert.equal(first.title, 'Başlangıç')
    assert.deepEqual(
      first.pages.map((page) => page.name.split('/').pop()),
      ['1.png', '2.png', '10.png']
    )
    assert.isTrue(plan.warnings.some((warning) => warning.includes('notlar.txt')))
    assert.isTrue(plan.warnings.some((warning) => warning.includes('bozuk.png')))
    assert.isTrue(plan.warnings.some((warning) => warning.includes('kapak.png')))

    // Images at the top: one chapter numbered from the archive name.
    const flat = planZip([item('3.png'), item('1.png'), item('2.png')], ['Bölüm 8.zip'])
    assert.isTrue(flat.flat)
    assert.equal(flat.chapters.length, 1)
    assert.equal(flat.chapters[0].number, 8)
    assert.deepEqual(
      flat.chapters[0].pages.map((page) => page.name),
      ['1.png', '2.png', '3.png']
    )
    // A single folder without a number is flat too; duplicated numbers are flagged.
    assert.isTrue(planZip([item('Sayfalar/1.png')]).flat)
    const twice = planZip([item('12/1.png'), item('Bölüm 12/1.png')])
    assert.equal(twice.chapters.filter((chapter) => chapter.importable).length, 1)
    assert.throws(() => planZip([item('a.txt', null)]), /görsel/)
  })
})

test.group('Admin tools: bulk upload, latest updates, file check and log', (group) => {
  let imageType: ContentType
  let textType: ContentType
  let series: Series
  let anime: Series
  let novel: Series
  let reader: User

  const common = () => ({
    description: 'Test',
    status: 'Devam Ediyor',
    translationStatus: 'Aktif',
    publicationYear: 2026,
    alternativeTitles: [],
    coverImage: '/images/no-cover.svg',
    featured: false,
    createdAt: now(),
    updatedAt: now(),
  })

  group.setup(async () => {
    imageType = await ContentType.create({
      name: 'Toplu Görsel',
      slug: 'toplu-gorsel',
      format: 'image',
    })
    textType = await ContentType.create({
      name: 'Toplu Metin',
      slug: 'toplu-metin',
      format: 'text',
    })
    const animeType = await ContentType.findByOrFail('slug', 'anime')
    series = await Series.create({
      ...common(),
      title: 'Toplu Test',
      slug: 'toplu-test',
      contentTypeId: imageType.id,
    })
    anime = await Series.create({
      ...common(),
      title: 'Toplu Anime',
      slug: 'toplu-anime',
      contentTypeId: animeType.id,
    })
    novel = await Series.create({
      ...common(),
      title: 'Toplu Roman',
      slug: 'toplu-roman',
      contentTypeId: textType.id,
    })
    for (const [username, role] of [
      ['toplu_admin', 'admin'],
      ['toplu_editor', 'editor'],
      ['toplu_uye', 'member'],
    ] as const)
      await User.create({
        username,
        email: `${username}@example.com`,
        fullName: username,
        password,
        role,
      })
    reader = await User.findByOrFail('username', 'toplu_uye')
    await db.table('bookmarks').insert([
      { user_id: reader.id, series_id: series.id, created_at: now() },
      { user_id: reader.id, series_id: novel.id, created_at: now() },
    ])
  })
  group.each.setup(() => clearAttempts())
  group.teardown(async () => {
    // The in-memory database is shared by every spec file: leave no series behind for lists.
    await Series.query()
      .whereIn('slug', ['toplu-test', 'toplu-anime', 'toplu-roman', 'sabit-seri', 'kirik-dosyali'])
      .delete()
    await ContentType.query().whereIn('id', [imageType.id, textType.id]).delete()
    await User.query().whereLike('username', 'toplu_%').delete()
    await db.from('admin_logs').delete()
    for (const folder of ['toplu-gorsel', 'toplu-metin', 'tools-missing', 'tools-orphans'])
      await rm(join(content.root, folder), { recursive: true, force: true })
    await rm(adminTools.bulk.tempDir, { recursive: true, force: true })
  })

  const notificationsOf = async () => {
    const [row] = await db.from('notifications').where('user_id', reader.id).count('* as total')
    return Number(row.total)
  }

  test('only staff reach the bulk upload; tools pages are for administrators', async ({
    assert,
  }) => {
    const guest = client()
    assert.oneOf(await statusOf(guest.request('/admin/toplu-yukle')), [302, 401])
    const member = client()
    await member.login('toplu_uye')
    assert.equal(await statusOf(member.request('/admin/toplu-yukle')), 403)
    const editor = client()
    await editor.login('toplu_editor')
    const page = await editor.page(`/admin/toplu-yukle?series_id=${series.id}`)
    assert.include(page, 'x-data="bulkUpload"')
    assert.include(page, 'Toplu Test')
    assert.notInclude(page, 'Toplu Anime')
    assert.include(page, 'href="/admin/toplu-yukle"')
    for (const path of ['/admin/dosya-denetimi', '/admin/etkinlik'])
      assert.equal(await statusOf(editor.request(path)), 403)
    assert.notInclude(page, 'href="/admin/etkinlik"')
    const admin = client()
    await admin.login('toplu_admin')
    for (const path of ['/admin/dosya-denetimi', '/admin/etkinlik'])
      assert.equal(await statusOf(admin.request(path)), 200)
  })

  test('archives are checked: type, paths, images, limits and series format', async ({
    assert,
  }) => {
    const editor = client()
    await editor.login('toplu_editor')
    const message = async (response: Response) => {
      const body = (await response.json()) as { message: string }
      return [response.status, body.message] as const
    }
    let [status, text] = await message(
      await editor.uploadZip(series.id, Buffer.from('not a zip at all'), 'x.zip')
    )
    assert.equal(status, 422)
    assert.match(text, /ZIP/)
    ;[status] = await message(
      await editor.uploadZip(series.id, makeZip([{ name: '1.png', data: png(1) }]), 'x.rar')
    )
    assert.equal(status, 422)
    ;[status, text] = await message(
      await editor.uploadZip(series.id, makeZip([{ name: '../kacak.png', data: png(1) }]))
    )
    assert.equal(status, 422)
    assert.match(text, /güvenli olmayan/)
    ;[status, text] = await message(
      await editor.uploadZip(series.id, makeZip([{ name: '/etc/kacak.png', data: png(1) }]))
    )
    assert.equal(status, 422)
    assert.match(text, /güvenli olmayan/)
    ;[status, text] = await message(
      await editor.uploadZip(
        series.id,
        makeZip([{ name: '1/sahte.png', data: Buffer.from('<svg></svg>') }])
      )
    )
    assert.equal(status, 422)
    assert.match(text, /görsel/)
    ;[status, text] = await message(
      await editor.uploadZip(
        series.id,
        makeZip([{ name: '1/bomba.png', data: png(1), deflate: true, claimedSize: 3 * 1024 ** 3 }])
      )
    )
    assert.equal(status, 422)
    assert.match(text, /açılmış boyutu/)
    const maxEntries = adminTools.bulk.maxEntries
    adminTools.bulk.maxEntries = 2
    try {
      ;[status, text] = await message(
        await editor.uploadZip(
          series.id,
          makeZip([1, 2, 3].map((n) => ({ name: `1/${n}.png`, data: png(n) })))
        )
      )
    } finally {
      adminTools.bulk.maxEntries = maxEntries
    }
    assert.equal(status, 422)
    assert.match(text, /en fazla 2 dosya/)
    ;[status] = await message(
      await editor.uploadZip(anime.id, makeZip([{ name: '1.png', data: png(1) }]))
    )
    assert.equal(status, 422)
    ;[status] = await message(
      await editor.uploadZip(999999, makeZip([{ name: '1.png', data: png(1) }]))
    )
    assert.equal(status, 404)
    // Rejected archives leave nothing behind.
    const left = await readdir(adminTools.bulk.tempDir).catch(() => [])
    assert.deepEqual(left, [])
  })

  test('folders import as chapters: skip or overwrite, draft or publish, one notification', async ({
    assert,
  }) => {
    const existing = await Chapter.create({
      seriesId: series.id,
      number: 1,
      title: 'Eski',
      content: { type: 'images', pages: ['/content/toplu-gorsel/eski/1.png'] },
      publishedAt: '2026-01-01',
      draft: true,
      access: 'public',
      createdAt: old,
      updatedAt: old,
    })
    await mkdir(join(content.root, 'toplu-gorsel', 'eski'), { recursive: true })
    await writeFile(join(content.root, 'toplu-gorsel', 'eski', '1.png'), png(9))
    await Series.query().where('id', series.id).update({ updatedAt: old })
    const before = await notificationsOf()

    const editor = client()
    await editor.login('toplu_editor')
    const archive = makeZip([
      { name: 'Bölüm 1 - Yeni/10.png', data: png(10), deflate: true },
      { name: 'Bölüm 1 - Yeni/2.png', data: png(2) },
      { name: 'Bölüm 1 - Yeni/1.png', data: png(1) },
      { name: '2/', data: Buffer.alloc(0) },
      { name: '2/01.jpg', data: jpg(21), deflate: true },
      { name: '2/02.jpg', data: jpg(22) },
      { name: '2.5/01.png', data: png(25) },
      { name: '__MACOSX/2/._01.jpg', data: Buffer.from('junk') },
      { name: 'oku-beni.txt', data: Buffer.from('merhaba') },
    ])
    const uploaded = await editor.uploadZip(series.id, archive, 'naruto.zip')
    assert.equal(uploaded.status, 200)
    const preview = (await uploaded.json()) as Preview
    assert.isFalse(preview.flat)
    assert.deepEqual(preview.existing, [1])
    assert.equal(preview.suggestedNumber, 2)
    assert.equal(preview.ignored, 1)
    assert.isTrue(preview.warnings.some((warning) => warning.includes('oku-beni.txt')))
    assert.deepEqual(
      preview.chapters.map((chapter) => [chapter.number, chapter.pageCount, chapter.importable]),
      [
        [1, 3, true],
        [2, 2, true],
        [null, 1, false],
      ]
    )
    assert.equal(preview.chapters[0].firstPage, '1.png')
    assert.equal(preview.chapters[0].lastPage, '10.png')
    assert.lengthOf(await readdir(adminTools.bulk.tempDir), 1)

    // Members cannot use someone else's token; a repeated number is refused before the import.
    const repeated = await editor.json('/admin/toplu-yukle/ice-aktar', {
      token: preview.token,
      series_id: series.id,
      mode: 'draft',
      conflict: 'skip',
      bump: true,
      notify: true,
      chapters: [
        { key: '2', number: 2 },
        { key: 'Bölüm 1 - Yeni', number: 2 },
      ],
    })
    assert.equal(repeated.status, 422)
    const admin = client()
    await admin.login('toplu_admin')
    const foreign = await admin.json('/admin/toplu-yukle/ice-aktar', {
      token: preview.token,
      series_id: series.id,
      mode: 'draft',
      conflict: 'skip',
      bump: true,
      notify: true,
      chapters: [{ key: '2', number: 2 }],
    })
    assert.equal(foreign.status, 404)

    // Draft + skip: chapter 1 stays as it was, chapter 2 is a quiet draft, the list is not bumped.
    const imported = await editor.json('/admin/toplu-yukle/ice-aktar', {
      token: preview.token,
      series_id: series.id,
      mode: 'draft',
      conflict: 'skip',
      bump: true,
      notify: true,
      chapters: [
        { key: '2', number: 2, title: 'İkinci' },
        { key: 'Bölüm 1 - Yeni', number: 1, title: 'Yeni' },
      ],
    })
    assert.equal(imported.status, 200)
    const summary = (await imported.json()) as Record<string, unknown>
    assert.deepEqual(summary.created, [2])
    assert.deepEqual(summary.skipped, [1])
    assert.deepEqual(summary.overwritten, [])
    const second = await Chapter.query()
      .where('seriesId', series.id)
      .where('number', 2)
      .firstOrFail()
    assert.isTrue(second.draft)
    assert.equal(second.title, 'İkinci')
    assert.equal(second.content.type, 'images')
    const secondPages = second.content.type === 'images' ? second.content.pages : []
    assert.lengthOf(secondPages, 2)
    assert.deepEqual(await readFile(diskPath(secondPages[0])), jpg(21))
    assert.match(
      secondPages[0],
      /^\/content\/toplu-gorsel\/toplu-test\/chapters\/2\/[0-9a-f-]+\.jpg$/
    )
    await existing.refresh()
    assert.equal(existing.title, 'Eski')
    assert.equal(await updatedOf(series.id), old)
    assert.equal(await notificationsOf(), before)
    // The archive is gone once imported; the same token cannot be used twice.
    assert.deepEqual(await readdir(adminTools.bulk.tempDir), [])
    const again = await editor.json('/admin/toplu-yukle/ice-aktar', {
      token: preview.token,
      series_id: series.id,
      mode: 'draft',
      conflict: 'skip',
      bump: true,
      notify: true,
      chapters: [{ key: '2', number: 2 }],
    })
    assert.equal(again.status, 404)

    // Publish + overwrite, without bumping: pages replaced in natural order, old files removed,
    // the draft goes live and readers get one notification for both chapters.
    const second2 = await jsonOf<Preview>(editor.uploadZip(series.id, archive))
    const overwrite = await editor.json('/admin/toplu-yukle/ice-aktar', {
      token: second2.token,
      series_id: series.id,
      mode: 'publish',
      conflict: 'overwrite',
      bump: false,
      notify: true,
      chapters: [
        { key: '2', number: 2 },
        { key: 'Bölüm 1 - Yeni', number: 1, title: 'Yeni' },
      ],
    })
    assert.equal(overwrite.status, 200)
    const result = (await overwrite.json()) as Record<string, unknown>
    assert.deepEqual(result.overwritten, [1, 2])
    assert.deepEqual(result.created, [])
    await existing.refresh()
    assert.equal(existing.title, 'Yeni')
    assert.isFalse(existing.draft)
    const pages = existing.content.type === 'images' ? existing.content.pages : []
    assert.deepEqual(await Promise.all(pages.map((page) => readFile(diskPath(page)))), [
      png(1),
      png(2),
      png(10),
    ])
    assert.isFalse(await exists(join(content.root, 'toplu-gorsel', 'eski', '1.png')))
    for (const page of secondPages) assert.isFalse(await exists(diskPath(page)))
    const live = await Chapter.query().where('seriesId', series.id).where('number', 2).firstOrFail()
    assert.isFalse(live.draft)
    assert.equal(await updatedOf(series.id), old)
    assert.equal(await notificationsOf(), before + 1)
    const note = await db
      .from('notifications')
      .where('user_id', reader.id)
      .orderBy('id', 'desc')
      .first()
    assert.include(note.title, 'Yeni bölümler')

    // The activity log has both bulk uploads.
    const logs = await AdminLog.query().where('action', 'bulk_upload').where('targetId', series.id)
    assert.lengthOf(logs, 2)
    assert.isTrue(logs.some((log) => log.summary.includes('2 bölümün üzerine yazdı')))
  })

  test('a flat archive is one chapter; bump and notify follow the switches; cancel cleans up', async ({
    assert,
  }) => {
    const editor = client()
    await editor.login('toplu_editor')
    const flat = makeZip([
      { name: '2.png', data: png(2) },
      { name: '1.png', data: png(1) },
    ])
    const preview = await jsonOf<Preview>(editor.uploadZip(series.id, flat, 'Bölüm 7.zip'))
    assert.isTrue(preview.flat)
    assert.equal(preview.chapters[0].number, 7)
    assert.equal(preview.chapters[0].key, '')
    await Series.query().where('id', series.id).update({ updatedAt: old })
    const before = await notificationsOf()
    const response = await editor.json('/admin/toplu-yukle/ice-aktar', {
      token: preview.token,
      series_id: series.id,
      mode: 'publish',
      conflict: 'skip',
      bump: true,
      notify: false,
      chapters: [{ key: '', number: 9 }],
    })
    assert.equal(response.status, 200)
    assert.deepEqual(((await response.json()) as { created: number[] }).created, [9])
    assert.notEqual(await updatedOf(series.id), old)
    assert.equal(await notificationsOf(), before)

    const cancelled = await jsonOf<Preview>(editor.uploadZip(series.id, flat))
    assert.lengthOf(await readdir(adminTools.bulk.tempDir), 1)
    assert.equal(
      await statusOf(editor.json('/admin/toplu-yukle/iptal', { token: cancelled.token })),
      200
    )
    assert.deepEqual(await readdir(adminTools.bulk.tempDir), [])
  })

  test('chapter form switches: keep the series in place and stay quiet', async ({ assert }) => {
    const admin = client()
    await admin.login('toplu_admin')
    await Series.query().where('id', novel.id).update({ updatedAt: old })
    const before = await notificationsOf()
    const quiet = await admin.post('/admin/bolumler/ekle', {
      series_id: String(novel.id),
      number: '1',
      text_content: 'Sessiz bölüm.',
      latest_controls: '1',
    })
    assert.equal(quiet.status, 302)
    assert.equal(await updatedOf(novel.id), old)
    assert.equal(await notificationsOf(), before)

    const loud = await admin.post('/admin/bolumler/ekle', {
      series_id: String(novel.id),
      number: '2',
      text_content: 'Duyurulan bölüm.',
      latest_controls: '1',
      bump: 'on',
      notify: 'on',
    })
    assert.equal(loud.status, 302)
    assert.notEqual(await updatedOf(novel.id), old)
    assert.equal(await notificationsOf(), before + 1)

    // Older clients without the switches keep the defaults (move up, notify).
    await Series.query().where('id', novel.id).update({ updatedAt: old })
    await admin.post('/admin/bolumler/ekle', {
      series_id: String(novel.id),
      number: '3',
      text_content: 'Varsayılan.',
    })
    assert.notEqual(await updatedOf(novel.id), old)
    assert.equal(await notificationsOf(), before + 2)

    // The form shows both switches; chapter changes are logged.
    const form = await admin.page(`/admin/bolumler/ekle?series_id=${novel.id}`)
    assert.include(form, 'name="latest_controls"')
    assert.include(form, 'name="bump"')
    assert.include(form, 'name="notify"')
    const created = await AdminLog.query().where('action', 'create').where('targetType', 'chapter')
    assert.isTrue(created.some((log) => log.summary.includes('"Toplu Roman" · Bölüm 2')))
  })

  test('pinned series stay on top of "Son Güncellenenler" with a badge', async ({ assert }) => {
    const admin = client()
    await admin.login('toplu_admin')
    const pinned = await Series.create({
      ...common(),
      title: 'Sabit Seri',
      slug: 'sabit-seri',
      contentTypeId: imageType.id,
      createdAt: old,
      updatedAt: old,
    })
    // The series form saves the flag (and logs the change).
    const saved = await admin.post(`/admin/seriler/${pinned.id}/duzenle`, {
      title: 'Sabit Seri',
      description: 'Test',
      content_type_id: String(imageType.id),
      status: 'Devam Ediyor',
      translation_status: 'Aktif',
      publication_year: '2026',
      pinned: 'on',
    })
    assert.equal(saved.status, 302)
    await pinned.refresh()
    assert.isTrue(pinned.pinned)
    await Series.query().where('id', pinned.id).update({ updatedAt: old })
    const seriesLogs = await AdminLog.query()
      .where('targetType', 'series')
      .where('targetId', pinned.id)
    assert.isTrue(seriesLogs.some((log) => log.action === 'update'))
    const form = await admin.page(`/admin/seriler/${pinned.id}/duzenle`)
    assert.match(form, /name="pinned"[^>]*checked/)

    const html = await textOf(fetch(base + '/', { headers: { 'x-fragment': 'home-updates' } }))
    const firstCard = html.indexOf('href="/series/')
    assert.equal(html.indexOf('href="/series/toplu-gorsel/sabit-seri"'), firstCard)
    assert.include(html, 'Sabitlendi')
    const list = await admin.page('/admin/seriler?search=Sabit')
    assert.include(list, 'Sabit</span>')

    await Series.query().where('id', pinned.id).update({ pinned: false })
    const after = await textOf(fetch(base + '/', { headers: { 'x-fragment': 'home-updates' } }))
    assert.notEqual(
      after.indexOf('href="/series/toplu-gorsel/sabit-seri"'),
      after.indexOf('href="/series/')
    )
  })

  test('the file checker lists missing files and counts orphans', async ({ assert }) => {
    const broken = await Series.create({
      ...common(),
      title: 'Kırık Dosyalı',
      slug: 'kirik-dosyali',
      contentTypeId: imageType.id,
      coverImage: '/content/tools-missing/kapak.png',
    })
    await mkdir(join(content.root, 'tools-missing'), { recursive: true })
    await writeFile(join(content.root, 'tools-missing', 'var.png'), png(1))
    const chapter = await Chapter.create({
      seriesId: broken.id,
      number: 1,
      title: null,
      content: {
        type: 'images',
        pages: ['/content/tools-missing/var.png', '/content/tools-missing/yok.png'],
      },
      publishedAt: '2026-01-01',
      draft: false,
      access: 'public',
      createdAt: now(),
      updatedAt: now(),
    })
    await mkdir(join(content.root, 'tools-orphans'), { recursive: true })
    await writeFile(join(content.root, 'tools-orphans', 'sahipsiz.png'), png(2))

    const admin = client()
    await admin.login('toplu_admin')
    const idle = await admin.page('/admin/dosya-denetimi')
    assert.include(idle, 'Henüz denetlenmedi')
    const html = await admin.page('/admin/dosya-denetimi?tara=1')
    assert.include(html, '/content/tools-missing/kapak.png')
    assert.include(html, '/content/tools-missing/yok.png')
    assert.notInclude(html, '/content/tools-missing/var.png')
    assert.include(html, `/admin/bolumler/${chapter.id}/duzenle`)
    assert.include(html, `/admin/seriler/${broken.id}/duzenle`)
    assert.include(html, 'tools-orphans')
    assert.include(html, '/content/tools-orphans/sahipsiz.png')
    // Nothing is deleted.
    assert.isTrue(await exists(join(content.root, 'tools-orphans', 'sahipsiz.png')))
  })

  test('the activity log lists, filters and prunes entries', async ({ assert }) => {
    const admin = client()
    await admin.login('toplu_admin')
    const member = await User.findByOrFail('username', 'toplu_editor')
    // Role changes are logged.
    await admin.post(`/admin/kullanicilar/${member.id}/duzenle`, { role: 'editor', banned: 'on' })
    await admin.post(`/admin/kullanicilar/${member.id}/duzenle`, { role: 'editor' })
    const roleLogs = await AdminLog.query().where('targetType', 'user').where('targetId', member.id)
    assert.isTrue(roleLogs.some((log) => log.summary.includes('askıya aldı')))

    const html = await admin.page('/admin/etkinlik')
    assert.include(html, 'Toplu yükledi')
    assert.include(html, '@toplu_editor')
    const filtered = await admin.page('/admin/etkinlik?action=bulk_upload')
    assert.include(filtered, 'serisine ZIP')
    assert.notInclude(filtered, 'askıya aldı')
    const searched = await admin.page('/admin/etkinlik?q=askıya')
    assert.include(searched, 'askıya aldı')
    assert.notInclude(searched, 'serisine ZIP')

    await db.table('admin_logs').insert({
      user_id: null,
      action: 'update',
      target_type: 'series',
      target_id: null,
      summary: 'Çok eski kayıt',
      created_at: '2025-01-01 00:00:00',
    })
    await adminLog.prune(true)
    assert.isNull(await AdminLog.findBy('summary', 'Çok eski kayıt'))
    assert.isNotNull(await AdminLog.query().where('action', 'bulk_upload').first())
  })
})
