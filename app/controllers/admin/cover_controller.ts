import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import covers, { type CoverSource } from '#config/covers'
import ContentType from '#models/content_type'
import Genre from '#models/genre'
import Author from '#models/author'
import Artist from '#models/artist'
import {
  CoverImageError,
  downloadCover,
  normalize,
  providers,
  searchCovers,
  workDetails,
  type CoverSearch,
  type WorkDetails,
} from '#services/cover_search_service'
import { now, slugify } from '#services/input_service'
import { recordAttempt, tooManyAttempts } from '#services/throttle'

const dictionaries = { genres: Genre, authors: Author, artists: Artist }
type Dictionary = keyof typeof dictionaries

const recordValidator = vine.compile(
  vine.object({
    kind: vine.enum(Object.keys(dictionaries) as Dictionary[]),
    name: vine.string().trim().minLength(1).maxLength(255),
  })
)

type Downloaded = Awaited<ReturnType<typeof downloadCover>>

/**
 * Recently downloaded images (thumbnails and the chosen cover) for half an hour, at most
 * 40 MB in all; the oldest go first.
 */
const recentImages = new Map<string, Downloaded>()
let recentBytes = 0
function remember(address: string, image: Downloaded) {
  recentImages.delete(address)
  recentImages.set(address, image)
  recentBytes += image.bytes.length
  setTimeout(() => forget(address, image), 30 * 60 * 1000).unref()
  while (recentBytes > 40 * 1024 * 1024 && recentImages.size > 1) {
    const [oldest, entry] = recentImages.entries().next().value!
    forget(oldest, entry)
  }
  return image
}
function forget(address: string, image: Downloaded) {
  if (recentImages.get(address) !== image) return
  recentImages.delete(address)
  recentBytes -= image.bytes.length
}

/** Same name regardless of case, accents, spaces and hyphens ("Chu-Gong" = "Chugong"). */
const key = (name: unknown) => normalize(name).replaceAll(' ', '')

/** The content type a work belongs to: anime/novel by format, comics by country. */
function contentTypeFor(details: WorkDetails, types: ContentType[]) {
  const bySlug = (slug: string) => types.find((type) => type.slug === slug)
  if (details.medium === 'anime')
    return bySlug('anime') || types.find((type) => type.format === 'video')
  if (details.medium === 'novel')
    return bySlug('novel') || types.find((type) => type.format === 'text')
  if (details.medium !== 'comic') return undefined
  const slug =
    ({ KR: 'manhwa', CN: 'manhua', TW: 'manhua' } as Record<string, string>)[
      details.country || ''
    ] || 'manga'
  return bySlug(slug) || bySlug('manga')
}

/**
 * "Otomatik doldur" in the series form (cover_finder.js): candidate covers/banners and series
 * details as JSON, the chosen image through this server, and quick genre/author/artist records.
 */
export default class CoverAdminController {
  private limited(userId: number, kind: string, max: number) {
    const name = `covers:${kind}:${userId}`
    if (tooManyAttempts(name, max)) return true
    recordAttempt(name, 60_000)
    return false
  }

  /** GET /admin/seriler/kapak-ara?q=&alt=a,b&type_id=&year= */
  async search({ request, response, auth }: HttpContext) {
    const query = String(request.input('q', '')).trim().slice(0, covers.maxQueryLength)
    if (!query) return response.unprocessableEntity({ error: 'Aramak için seri başlığını yazın.' })
    if (this.limited(auth.user!.id, 'search', covers.searchesPerMinute))
      return response.tooManyRequests({
        error: 'Çok sık arama yaptınız; bir dakika sonra deneyin.',
      })

    const alternatives = String(request.input('alt', ''))
      .split(',')
      .map((title) => title.trim().slice(0, covers.maxQueryLength))
      .filter(Boolean)
      .slice(0, 10)
    const typeId = Number(request.input('type_id'))
    const type = Number.isInteger(typeId) && typeId > 0 ? await ContentType.find(typeId) : null
    const year = Number(request.input('year'))
    const search: CoverSearch = {
      query,
      alternatives,
      format: type?.format || 'image',
      type: type?.slug,
      year: Number.isInteger(year) && year > 1900 && year < 2200 ? year : null,
    }
    response.header('Cache-Control', 'no-store')
    return response.send(await searchCovers(search))
  }

  /**
   * GET /admin/seriler/kapak-bilgi?source=&ref=&type_id= — one work in full plus what it means
   * for this site: the matching content type, genres (unmatched ones are only named) and
   * authors/artists (`id: null` when the dictionary does not have them yet).
   */
  async details({ request, response, auth }: HttpContext) {
    const source = String(request.input('source', '')) as CoverSource
    const ref = String(request.input('ref', '')).slice(0, 40)
    // Own keys only: `in` would also accept inherited names such as `toString`.
    if (!Object.hasOwn(providers, source) || !/^[\w-]+$/.test(ref))
      return response.unprocessableEntity({ error: 'Geçersiz kaynak.' })
    if (this.limited(auth.user!.id, 'details', covers.detailsPerMinute))
      return response.tooManyRequests({ error: 'Çok sık istek yaptınız; biraz bekleyin.' })

    const typeId = Number(request.input('type_id'))
    const formType = Number.isInteger(typeId) && typeId > 0 ? await ContentType.find(typeId) : null
    let details: WorkDetails
    try {
      details = await workDetails(source, ref, formType?.format || 'image')
    } catch {
      return response.status(502).send({
        error: `${covers.sources[source].label} şu an yanıt vermiyor; başka bir sonuç seçin.`,
      })
    }

    const [types, genres, authors, artists] = await Promise.all([
      ContentType.query().orderBy('id'),
      Genre.query().select('id', 'name'),
      Author.query().select('id', 'name'),
      Artist.query().select('id', 'name'),
    ])
    const genreByName = new Map(genres.map((genre) => [key(genre.name), genre]))
    const matchedGenres = new Map<number, { id: number; name: string; from: string }>()
    const unmatchedGenres: string[] = []
    for (const [index, name] of [...details.genres, ...details.tags].entries()) {
      const genre = genreByName.get(key(covers.genres[name] || name)) || genreByName.get(key(name))
      if (genre) {
        if (!matchedGenres.has(genre.id))
          matchedGenres.set(genre.id, { id: genre.id, name: genre.name, from: name })
      } else if (index < details.genres.length) unmatchedGenres.push(covers.genres[name] || name)
    }
    const people = (names: string[], records: { id: number; name: string }[]) => {
      const byName = new Map(records.map((record) => [key(record.name), record]))
      return names.slice(0, 8).map((name) => {
        const record = byName.get(key(name))
        return record ? { id: record.id, name: record.name } : { id: null, name }
      })
    }
    const type = contentTypeFor(details, types)

    response.header('Cache-Control', 'no-store')
    return response.send({
      ...details,
      contentType: type ? { id: type.id, name: type.name } : null,
      genres: { matched: [...matchedGenres.values()], unmatched: unmatchedGenres },
      authors: people(details.authors, authors),
      artists: people(details.artists, artists),
    })
  }

  /** POST /admin/seriler/kapak-kayit (kind genres|authors|artists, name): finds or adds one. */
  async record({ request, response }: HttpContext) {
    const { kind, name } = await request.validateUsing(recordValidator)
    const slug = slugify(name)
    if (!slug) return response.unprocessableEntity({ error: 'Ad en az bir harf içermeli.' })
    const Model = dictionaries[kind]
    const records = await Model.query().select('id', 'name', 'slug')
    const existing = records.find(
      (record) => record.slug === slug || key(record.name) === key(name)
    )
    if (existing) return response.send({ id: existing.id, name: existing.name, created: false })
    const timestamp = now()
    const created = await Model.create({ name, slug, createdAt: timestamp, updatedAt: timestamp })
    return response.send({ id: created.id, name: created.name, created: true })
  }

  /** GET /admin/seriler/kapak-gorsel?url= (only hosts on covers.imageHosts) */
  async image({ request, response, auth }: HttpContext) {
    const address = String(request.input('url', ''))
    // Thumbnails of a result grid are asked again on every search; cached ones do not count
    // toward the limit, so a few searches in a row never leave blank cards.
    let image = recentImages.get(address)
    if (!image && this.limited(auth.user!.id, 'image', covers.imagesPerMinute))
      return response.tooManyRequests({ error: 'Çok fazla görsel istendi; biraz bekleyin.' })
    try {
      image ??= remember(address, await downloadCover(address))
      response.header('Content-Type', image.type)
      response.header('Cache-Control', 'private, max-age=86400')
      response.header('X-Content-Type-Options', 'nosniff')
      response.header('Content-Security-Policy', "default-src 'none'; sandbox")
      response.header('X-Cover-Extension', image.ext)
      return response.send(image.bytes)
    } catch (error) {
      const message =
        error instanceof CoverImageError ? error.message : 'Görsel indirilemedi; tekrar deneyin.'
      return response.status(error instanceof CoverImageError ? error.status : 502).send({
        error: message,
      })
    }
  }
}
