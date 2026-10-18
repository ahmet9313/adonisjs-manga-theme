import { test } from '@japa/runner'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import ContentType from '#models/content_type'
import Series from '#models/series'
import Chapter from '#models/chapter'
import User from '#models/user'
import content from '#config/content'
import watch from '#config/watch'
import { now } from '#services/input_service'
import { clearAttempts } from '#services/throttle'
import { normalizeLink, episodeVideo, VideoLinkError } from '#services/video_service'

const base = 'http://127.0.0.1:3334'
const password = 'watch-password-123'
/** Smallest thing our signature check accepts as MP4: a box size and "ftyp". */
const fakeMp4 = Buffer.concat([Buffer.from('\0\0\0\x18ftypisom', 'latin1'), Buffer.alloc(500, 7)])

const exists = async (path: string) =>
  access(path).then(
    () => true,
    () => false
  )
const diskPath = (publicPath: string) =>
  join(content.root, ...publicPath.slice('/content/'.length).split('/'))

/** Minimal cookie-aware client; `csrf()` reads the meta token for header-based requests. */
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
  const formToken = async (path: string) => {
    const html = await page(path)
    return html.match(/name=['"]_csrf['"] value=['"]([^'"]+)['"]/)?.[1] || ''
  }
  const csrf = async (path = '/') => {
    const html = await page(path)
    return html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || ''
  }
  const login = async (identifier: string) =>
    request('/giris', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await formToken('/giris'), login: identifier, password }),
    })
  const upload = async (seriesId: number, bytes: Buffer, name: string, token?: string) => {
    const form = new FormData()
    form.append('video', new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }), name)
    return request(`/admin/bolumler/video?series_id=${seriesId}`, {
      method: 'POST',
      body: form,
      headers: { 'accept': 'application/json', 'x-csrf-token': token ?? (await csrf()) },
    })
  }
  const cookie = () => [...cookies].map(([key, value]) => `${key}=${value}`).join('; ')
  return { request, page, formToken, csrf, login, upload, cookie }
}

test.group('Video episodes: links', () => {
  test('normalizeLink converts pages and iframe code to https players', ({ assert }) => {
    const id = 'dQw4w9WgXcQ'
    for (const raw of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `<iframe width="560" src="https://www.youtube.com/embed/${id}?si=a&amp;b=1" allowfullscreen></iframe>`,
    ]) {
      const link = normalizeLink(raw)
      assert.equal(link.url, `https://www.youtube-nocookie.com/embed/${id}`, raw)
      assert.equal(link.kind, 'embed')
      assert.equal(link.host, 'YouTube')
    }
    assert.equal(
      normalizeLink(`https://youtu.be/${id}?t=1m30s`).url,
      `https://www.youtube-nocookie.com/embed/${id}?start=90`
    )
    assert.deepEqual(normalizeLink('https://drive.google.com/file/d/AbC_12-x/view?usp=sharing'), {
      url: 'https://drive.google.com/file/d/AbC_12-x/preview',
      kind: 'embed',
      host: 'Google Drive',
    })
    assert.equal(
      normalizeLink('https://www.dailymotion.com/video/x8abc12').url,
      'https://geo.dailymotion.com/player.html?video=x8abc12'
    )
    assert.equal(
      normalizeLink('https://dai.ly/x8abc12').url,
      'https://geo.dailymotion.com/player.html?video=x8abc12'
    )
    assert.deepEqual(normalizeLink('https://ok.ru/video/123456789'), {
      url: 'https://ok.ru/videoembed/123456789',
      kind: 'embed',
      host: 'Odnoklassniki',
    })
    assert.equal(
      normalizeLink('https://vimeo.com/76979871').url,
      'https://player.vimeo.com/video/76979871'
    )
    // Pasted iframe code with single quotes and a protocol-relative address.
    const sibnet = normalizeLink(
      "<iframe src='//video.sibnet.ru/shell.php?videoid=1&amp;x=2' frameborder=0></iframe>"
    )
    assert.equal(sibnet.url, 'https://video.sibnet.ru/shell.php?videoid=1&x=2')
    assert.equal(sibnet.host, 'Sibnet')
    // Unknown sites stay as they are; the host name comes from the address.
    assert.deepEqual(normalizeLink('https://www.player.example.org/e/abc'), {
      url: 'https://www.player.example.org/e/abc',
      kind: 'embed',
      host: 'player.example.org',
    })
    assert.deepEqual(normalizeLink('https://cdn.example.com/ep1.MP4?token=1'), {
      url: 'https://cdn.example.com/ep1.MP4?token=1',
      kind: 'file',
      host: 'cdn.example.com',
    })
  })

  test('normalizeLink rejects http, scripts and junk', ({ assert }) => {
    assert.throws(() => normalizeLink('http://example.com/video.mp4'), /https/)
    for (const raw of [
      'javascript:alert(1)',
      'data:text/html,<b>x</b>',
      '',
      'not a link',
      '<div>no iframe</div>',
      `https://example.com/${'a'.repeat(2100)}`,
      'https://user:pass@example.com/v',
    ]) {
      assert.throws(() => normalizeLink(raw), VideoLinkError)
    }
  })

  test('episodeVideo keeps the order and shows the local host name', ({ assert }) => {
    const video = episodeVideo([
      { host: 'eski', kind: 'local', url: '/content/videos/1/a.mp4', label: null },
      { host: 'YouTube', kind: 'embed', url: 'https://x.test/1', label: '1080p' },
      { host: 'Vimeo', kind: 'embed', url: 'https://x.test/2', label: null },
    ])
    assert.deepEqual(
      video.sources.map((source) => [source.host, source.label]),
      [
        [watch.localHost, null],
        ['YouTube', '1080p'],
        ['Vimeo', null],
      ]
    )
  })
})

test.group('Video episodes: administration and watching', (group) => {
  let anime: ContentType
  let series: Series
  let manga: Series

  group.setup(async () => {
    const timestamp = now()
    anime = await ContentType.findByOrFail('slug', 'anime')
    const mangaType =
      (await ContentType.findBy('slug', 'manga')) ??
      (await ContentType.create({ name: 'Manga', slug: 'manga' }))
    const common = {
      description: 'Test',
      status: 'Devam Ediyor',
      translationStatus: 'Aktif',
      publicationYear: 2026,
      alternativeTitles: [],
      coverImage: '/images/no-cover.svg',
      featured: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    series = await Series.create({
      ...common,
      title: 'İzleme Testi',
      slug: 'izleme-testi',
      contentTypeId: anime.id,
    })
    manga = await Series.create({
      ...common,
      title: 'Video Almayan Seri',
      slug: 'video-almayan-seri',
      contentTypeId: mangaType.id,
    })
    for (const [username, role] of [
      ['izleyen_admin', 'admin'],
      ['izleyen_uye', 'member'],
    ] as const)
      await User.create({
        username,
        email: `${username}@example.com`,
        fullName: username,
        password,
        role,
      })
  })
  group.each.setup(() => clearAttempts())
  group.teardown(async () => {
    for (const item of [series, manga])
      await rm(join(content.root, 'videos', String(item.id)), { recursive: true, force: true })
  })

  test('the migration adds the anime content type', async ({ assert }) => {
    assert.equal(anime.name, 'Anime')
  })

  test('guests and members cannot upload videos', async ({ assert }) => {
    const guest = client()
    const anonymous = await guest.upload(series.id, fakeMp4, 'a.mp4', 'x')
    assert.oneOf(anonymous.status, [401, 302])

    const member = client()
    await member.login('izleyen_uye')
    const denied = await member.upload(series.id, fakeMp4, 'a.mp4')
    assert.equal(denied.status, 403)
  })

  test('staff upload, link and play episode videos; files follow the episode', async ({
    assert,
  }) => {
    const admin = client()
    const login = await admin.login('izleyen_admin')
    assert.equal(login.status, 302)

    // Rejected uploads: wrong bytes, wrong extension, unknown or non-video series, no file.
    const fake = await admin.upload(series.id, Buffer.from('not really a video at all'), 'x.mp4')
    assert.equal(fake.status, 422)
    const fakeBody = (await fake.json()) as { message: string }
    assert.match(fakeBody.message, /video/i)
    const statusOf = async (response: Promise<Response>) => {
      const result = await response
      return result.status
    }
    assert.equal(await statusOf(admin.upload(series.id, fakeMp4, 'x.avi')), 422)
    assert.equal(await statusOf(admin.upload(999999, fakeMp4, 'x.mp4')), 404)
    assert.equal(await statusOf(admin.upload(manga.id, fakeMp4, 'x.mp4')), 422)
    const empty = await admin.request(`/admin/bolumler/video?series_id=${series.id}`, {
      method: 'POST',
      body: (() => {
        const form = new FormData()
        form.append('other', 'value')
        return form
      })(),
      headers: { 'accept': 'application/json', 'x-csrf-token': await admin.csrf() },
    })
    assert.equal(empty.status, 422)

    // A declared body above the limit is refused before anything is read.
    const token = await admin.csrf()
    const tooLarge = await new Promise<number>((done, fail) => {
      const call = httpRequest(
        `${base}/admin/bolumler/video?series_id=${series.id}`,
        {
          method: 'POST',
          headers: {
            'cookie': admin.cookie(),
            'accept': 'application/json',
            'x-csrf-token': token,
            'content-type': 'multipart/form-data; boundary=x',
            'content-length': String(watch.maxUploadBytes + 10 * 1024 ** 2),
          },
        },
        (response) => {
          done(response.statusCode || 0)
          call.destroy()
        }
      )
      call.on('error', fail)
      call.write('--x\r\n')
    })
    assert.equal(tooLarge, 413)

    const uploaded = await admin.upload(series.id, fakeMp4, 'Bölüm 1.mp4')
    assert.equal(uploaded.status, 200)
    const video = (await uploaded.json()) as { url: string; name: string; size: number }
    assert.match(video.url, new RegExp(`^/content/videos/${series.id}/[0-9a-f-]{36}\\.mp4$`))
    assert.equal(video.name, 'Bölüm 1.mp4')
    assert.equal(video.size, fakeMp4.length)
    assert.isTrue(await exists(diskPath(video.url)))

    // Form posts: invalid sources are rejected without creating the episode.
    const post = async (path: string, sources: unknown, json = false) =>
      admin.request(path, {
        method: 'POST',
        headers: json ? { accept: 'application/json' } : {},
        body: new URLSearchParams({
          _csrf: await admin.csrf(),
          series_id: String(series.id),
          number: '1',
          title: 'Başlangıç',
          sources: typeof sources === 'string' ? sources : JSON.stringify(sources),
        }),
      })
    for (const bad of [
      [],
      'not json',
      [{ kind: 'video', url: 'https://youtu.be/dQw4w9WgXcQ' }],
      [{ kind: 'link', url: 'http://example.com/v' }],
      [{ kind: 'local', url: `/content/videos/${series.id}/../../x.mp4` }],
      [
        { kind: 'link', url: 'https://youtu.be/dQw4w9WgXcQ' },
        { kind: 'link', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      ],
    ]) {
      const rejected = await post('/admin/bolumler/ekle', bad, true)
      assert.equal(rejected.status, 422, JSON.stringify(bad))
      const body = (await rejected.json()) as { errors: { field: string }[] }
      assert.equal(body.errors[0].field, 'sources')
    }
    const flashed = await post('/admin/bolumler/ekle', [{ kind: 'link', url: 'x' }])
    assert.equal(flashed.status, 302)
    assert.isNull(await Chapter.query().where('seriesId', series.id).first())

    const created = await post('/admin/bolumler/ekle', [
      { kind: 'local', url: video.url, label: '1080p' },
      {
        kind: 'link',
        url: '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
      },
      { kind: 'link', url: 'https://ok.ru/video/42', host: 'Yedek' },
    ])
    assert.equal(created.status, 302)
    const episode = await Chapter.query().where('seriesId', series.id).firstOrFail()
    assert.deepEqual(episode.content, {
      type: 'video',
      sources: [
        {
          host: watch.localHost,
          kind: 'local',
          url: video.url,
          label: '1080p',
        },
        {
          host: 'YouTube',
          kind: 'embed',
          url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
          label: null,
        },
        {
          host: 'Yedek',
          kind: 'embed',
          url: 'https://ok.ru/videoembed/42',
          label: null,
        },
      ],
    })

    // The edit form still renders for a video episode.
    const form = await admin.request(`/admin/bolumler/${episode.id}/duzenle`)
    assert.equal(form.status, 200)

    // The watch page lists the sources.
    const watchPage = await admin.request('/series/anime/izleme-testi/1')
    assert.equal(watchPage.status, 200)
    const html = await watchPage.text()
    assert.include(html, 'Yedek')
    assert.include(html, video.url)
    assert.include(html, 'youtube-nocookie.com/embed/dQw4w9WgXcQ')

    // The uploaded video is served with range support.
    const full = await fetch(base + video.url)
    assert.equal(full.status, 200)
    assert.equal(full.headers.get('content-type'), 'video/mp4')
    assert.equal(full.headers.get('accept-ranges'), 'bytes')
    assert.equal(full.headers.get('x-content-type-options'), 'nosniff')
    assert.match(full.headers.get('cache-control') || '', /public, max-age=\d+/)
    assert.equal(Buffer.from(await full.arrayBuffer()).compare(fakeMp4), 0)
    const head = await fetch(base + video.url, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(head.headers.get('content-length'), String(fakeMp4.length))
    const part = await fetch(base + video.url, { headers: { range: 'bytes=4-11' } })
    assert.equal(part.status, 206)
    assert.equal(part.headers.get('content-range'), `bytes 4-11/${fakeMp4.length}`)
    assert.equal(part.headers.get('content-length'), '8')
    assert.equal(Buffer.from(await part.arrayBuffer()).toString('latin1'), 'ftypisom')
    const tail = await fetch(base + video.url, { headers: { range: 'bytes=-10' } })
    assert.equal(tail.status, 206)
    assert.equal(
      tail.headers.get('content-range'),
      `bytes ${fakeMp4.length - 10}-${fakeMp4.length - 1}/${fakeMp4.length}`
    )
    const outside = await fetch(base + video.url, { headers: { range: 'bytes=99999-' } })
    assert.equal(outside.status, 416)
    assert.equal(outside.headers.get('content-range'), `bytes */${fakeMp4.length}`)

    // Editing away the uploaded source deletes its file.
    const edited = await admin.request(`/admin/bolumler/${episode.id}/duzenle`, {
      method: 'POST',
      body: new URLSearchParams({
        _csrf: await admin.csrf(),
        series_id: String(series.id),
        number: '1',
        sources: JSON.stringify([{ kind: 'embed', url: 'https://ok.ru/videoembed/42' }]),
      }),
    })
    assert.equal(edited.status, 302)
    await episode.refresh()
    assert.lengthOf((episode.content as { sources: unknown[] }).sources, 1)
    assert.isFalse(await exists(diskPath(video.url)))

    // Deleting the episode deletes its uploaded videos.
    const secondUpload = await admin.upload(series.id, fakeMp4, 'b.m4v')
    const second = (await secondUpload.json()) as { url: string }
    const kept = await admin.request(`/admin/bolumler/${episode.id}/duzenle`, {
      method: 'POST',
      body: new URLSearchParams({
        _csrf: await admin.csrf(),
        series_id: String(series.id),
        number: '1',
        sources: JSON.stringify([{ kind: 'local', url: second.url }]),
      }),
    })
    assert.equal(kept.status, 302)
    assert.isTrue(await exists(diskPath(second.url)))
    const removed = await admin.request(`/admin/bolumler/${episode.id}/sil`, {
      method: 'POST',
      body: new URLSearchParams({ _csrf: await admin.csrf() }),
    })
    assert.equal(removed.status, 302)
    assert.isNull(await Chapter.find(episode.id))
    assert.isFalse(await exists(diskPath(second.url)))
  })

  test('local sources must exist and belong to the series', async ({ assert }) => {
    const admin = client()
    await admin.login('izleyen_admin')
    const foreign = `/content/videos/${manga.id}/00000000-0000-4000-8000-000000000000.mp4`
    const missing = `/content/videos/${series.id}/00000000-0000-4000-8000-000000000001.mp4`
    await mkdir(join(content.root, 'videos', String(manga.id)), { recursive: true })
    await writeFile(diskPath(foreign), fakeMp4)
    for (const url of [foreign, missing]) {
      const response = await admin.request('/admin/bolumler/ekle', {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: new URLSearchParams({
          _csrf: await admin.csrf(),
          series_id: String(series.id),
          number: '7',
          sources: JSON.stringify([{ kind: 'local', url }]),
        }),
      })
      assert.equal(response.status, 422, url)
      const body = (await response.json()) as { errors: { message: string }[] }
      assert.match(body.errors[0].message, /^1\. kaynak/)
    }
  })

  test('a fansub field from an old form is ignored', async ({ assert }) => {
    const admin = client()
    await admin.login('izleyen_admin')
    const created = await admin.request('/admin/bolumler/ekle', {
      method: 'POST',
      body: new URLSearchParams({
        _csrf: await admin.csrf(),
        series_id: String(series.id),
        number: '9',
        sources: JSON.stringify([
          { fansub: 'Eski Ad', kind: 'link', url: 'https://youtu.be/dQw4w9WgXcQ', label: '1080p' },
        ]),
      }),
    })
    assert.equal(created.status, 302)
    const episode = await Chapter.query()
      .where('seriesId', series.id)
      .where('number', 9)
      .firstOrFail()
    assert.deepEqual(episode.content, {
      type: 'video',
      sources: [
        {
          host: 'YouTube',
          kind: 'embed',
          url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
          label: '1080p',
        },
      ],
    })
    const html = await admin.page('/series/anime/izleme-testi/9')
    assert.notInclude(html, 'Eski Ad')
    assert.include(html, '1 kaynak')
    await episode.delete()
  })
})
