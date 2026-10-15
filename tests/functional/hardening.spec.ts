import { test } from '@japa/runner'
import { IncomingMessage, ServerResponse, get as httpGet } from 'node:http'
import { Socket } from 'node:net'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { errors } from '@adonisjs/core'
import testUtils from '@adonisjs/core/services/test_utils'
import HttpExceptionHandler, { GENERIC_SERVER_ERROR } from '#exceptions/handler'
import content from '#config/content'
import User from '#models/user'
import { MEMBER_UPLOAD_LIMIT } from '#middleware/upload_gate_middleware'

const base = 'http://127.0.0.1:3334'

/** Raw GET: fetch() adds `cache-control: no-cache` to conditional requests, defeating 304s. */
function rawGet(path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Record<string, unknown> }>((done, fail) => {
    httpGet(`${base}${path}`, { headers }, (response) => {
      response.resume()
      response.on('end', () => done({ status: response.statusCode!, headers: response.headers }))
    }).on('error', fail)
  })
}

/** A bare context like the one an unmatched URL gets: no session, CSRF or auth. */
async function bareContext(accept: string) {
  const req = new IncomingMessage(new Socket())
  req.url = '/yok-boyle-bir-sayfa'
  req.method = 'GET'
  req.headers = { accept }
  const res = new ServerResponse(req)
  return testUtils.createHttpContext({ req, res })
}

/** The handler exactly as it behaves in production (no debug output, status pages on). */
function productionHandler() {
  const handler = new HttpExceptionHandler()
  Object.assign(handler, { debug: false, renderStatusPages: true })
  return handler
}

test.group('Production error handling', () => {
  test('unknown URLs render the 404 page without the session', async ({ assert }) => {
    const ctx = await bareContext('text/html')
    await productionHandler().handle(new errors.E_ROUTE_NOT_FOUND(['GET', '/yok']), ctx)
    assert.equal(ctx.response.getStatus(), 404)
    const body = String(ctx.response.getBody())
    assert.include(body, 'Sayfa bulunamadı')
    assert.include(body, '<h1')
    assert.notInclude(body, 'Cannot read properties')
  })

  test('server errors hide internal details in HTML and JSON', async ({ assert }) => {
    const secret = 'SQLITE_ERROR: no such table: gizli_tablo'

    const html = await bareContext('text/html')
    await productionHandler().handle(new Error(secret), html)
    assert.equal(html.response.getStatus(), 500)
    assert.include(String(html.response.getBody()), 'Sunucu hatası')
    assert.notInclude(String(html.response.getBody()), secret)

    const json = await bareContext('application/json')
    await productionHandler().handle(new Error(secret), json)
    assert.equal(json.response.getStatus(), 500)
    assert.deepEqual(json.response.getBody(), { message: GENERIC_SERVER_ERROR })
  })

  test('client errors keep their message', async ({ assert }) => {
    const json = await bareContext('application/json')
    await productionHandler().handle(
      new errors.E_HTTP_EXCEPTION('Bu bölüm bulunamadı', { status: 404 }),
      json
    )
    assert.equal(json.response.getStatus(), 404)
    assert.deepEqual(json.response.getBody(), { message: 'Bu bölüm bulunamadı' })
  })
})

test.group('Caching and media headers', () => {
  test('public images are cached and SVG documents are sandboxed', async ({ assert }) => {
    const response = await fetch(`${base}/images/no-cover.svg`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'public, max-age=86400')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.include(response.headers.get('content-security-policy') ?? '', 'sandbox')
  })

  test('uploaded content is cached for a week and supports conditional requests', async ({
    assert,
  }) => {
    const folder = join(content.root, 'onbellek-testi')
    await mkdir(folder, { recursive: true })
    await writeFile(join(folder, 'kapak.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    try {
      const first = await fetch(`${base}/content/onbellek-testi/kapak.svg`)
      assert.equal(first.status, 200)
      assert.equal(first.headers.get('cache-control'), 'public, max-age=604800')
      assert.include(first.headers.get('content-security-policy') ?? '', 'sandbox')
      const etag = first.headers.get('etag')
      assert.isString(etag)
      const again = await rawGet('/content/onbellek-testi/kapak.svg', { 'if-none-match': etag! })
      assert.equal(again.status, 304)
      // Served before the router middleware: no session is started for images.
      assert.isUndefined(first.headers.get('set-cookie') ?? undefined)
      assert.isUndefined(again.headers['set-cookie'])
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
})

test.group('Upload gate', () => {
  const multipart = (size: number) => {
    const form = new FormData()
    form.append('body', 'merhaba')
    form.append('image', new Blob([new Uint8Array(size)], { type: 'image/png' }), 'a.png')
    return form
  }

  test('guests cannot stream multipart bodies to any POST URL', async ({ assert }) => {
    for (const path of ['/yorumlar', '/giris', '/admin/seriler/ekle', '/rastgele-adres']) {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        body: multipart(1024),
        headers: { accept: 'application/json' },
        redirect: 'manual',
      })
      assert.oneOf(response.status, [401, 404], path)
      assert.notEqual(response.status, 200, path)
    }
  })

  test('members may upload small files, but not large ones', async ({ assert }) => {
    const password = 'gate-password-123'
    await User.create({
      username: 'yukleyen',
      email: 'yukleyen@example.com',
      fullName: 'Yükleyen',
      password,
      role: 'member',
    })
    const cookies = new Map<string, string>()
    const call = async (path: string, init: RequestInit = {}) => {
      const response = await fetch(`${base}${path}`, {
        ...init,
        redirect: 'manual',
        headers: {
          cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
          ...init.headers,
        },
      })
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(';')
        cookies.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1))
      }
      return response
    }
    const csrf = async () => {
      const page = await call('/giris')
      const html = await page.text()
      return html.match(/name=['"]_csrf['"] value=['"]([^'"]+)/)?.[1]
    }
    await call('/giris', {
      method: 'POST',
      body: new URLSearchParams({ _csrf: (await csrf())!, login: 'yukleyen', password }),
    })

    const tooLarge = await call('/yorumlar', {
      method: 'POST',
      body: multipart(MEMBER_UPLOAD_LIMIT + 1024),
      headers: { accept: 'application/json' },
    })
    assert.equal(tooLarge.status, 413)

    // A small body passes the gate and reaches the usual checks (here: CSRF, since no token).
    const small = await call('/yorumlar', {
      method: 'POST',
      body: multipart(1024),
      headers: { accept: 'application/json' },
    })
    assert.notEqual(small.status, 413)
    assert.notEqual(small.status, 401)
  })
})
