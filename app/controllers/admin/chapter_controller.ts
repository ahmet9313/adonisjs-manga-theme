import type { HttpContext } from '@adonisjs/core/http'
import Chapter from '#models/chapter'
import SeriesModel from '#models/series'
import vine from '@vinejs/vine'
import app from '@adonisjs/core/services/app'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

const chapterValidator = vine.compile(
  vine.object({
    series_id: vine.number(),
    number: vine.number(),
    title: vine.string().maxLength(255).optional(),
    text_content: vine.string().optional(),
  })
)

export default class ChapterAdminController {
  async index({ view, request }: HttpContext) {
    const seriesId = request.input('series_id')

    const page = request.input('page', 1)
    const allowedSizes = [10, 20, 30, 50, 1000, 5000]
    const perPage = allowedSizes.includes(Number(request.input('per_page'))) ? Number(request.input('per_page')) : 20

    let query = Chapter.query().preload('series').orderBy('createdAt', 'desc')

    if (seriesId) {
      query = query.where('seriesId', seriesId)
    }

    const chapters = await query.paginate(page, perPage)
    chapters.baseUrl('/admin/bolumler')
    chapters.queryString({ per_page: perPage, ...(seriesId ? { series_id: seriesId } : {}) })

    const seriesList = await SeriesModel.query().orderBy('title', 'asc').select('id', 'title')

    return view.render('pages/admin/chapters/index', {
      title: 'Bölümler',
      chapters,
      paginator: chapters,
      seriesList,
      selectedSeriesId: seriesId ? Number(seriesId) : null,
      perPage,
    })
  }

  async create({ view, request }: HttpContext) {
    const preSelectedSeriesId = request.input('series_id')

    const seriesList = await SeriesModel.query()
      .preload('contentType')
      .orderBy('title', 'asc')

    const seriesContentTypeMap: Record<number, string> = {}
    for (const s of seriesList) {
      seriesContentTypeMap[s.id] = s.contentType?.slug || 'manga'
    }

    let currentContentType = ''
    if (preSelectedSeriesId) {
      currentContentType = seriesContentTypeMap[Number(preSelectedSeriesId)] || ''
    }

    return view.render('pages/admin/chapters/form', {
      title: 'Yeni Bölüm Ekle',
      seriesList,
      seriesContentTypeMap,
      currentContentType,
      preSelectedSeriesId: preSelectedSeriesId ? Number(preSelectedSeriesId) : null,
    })
  }

  async store({ request, session, response }: HttpContext) {
    const data = await request.validateUsing(chapterValidator)

    const existing = await Chapter.query()
      .where('seriesId', data.series_id)
      .where('number', data.number)
      .first()

    if (existing) {
      session.flash('error', `Bu seride ${data.number}. bölüm zaten mevcut`)
      return response.redirect('/admin/bolumler/ekle')
    }

    const series = await SeriesModel.query()
      .where('id', data.series_id)
      .preload('contentType')
      .firstOrFail()

    const isNovel = series.contentType?.slug === 'novel'

    let content: any

    if (isNovel) {
      content = { type: 'text', text: data.text_content || '' }
    } else {
      const pageOrder: string[] = JSON.parse(request.input('page_order', '[]'))
      const newFiles = request.files('pages', { size: '10mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] })

      const dir = join(
        app.publicPath(),
        'content',
        series.contentType?.slug || 'manga',
        series.slug,
        'chapters',
        String(data.number)
      )

      const finalPages: string[] = []
      let newFileIndex = 0

      if (pageOrder.length > 0) {
        await mkdir(dir, { recursive: true })
        for (let i = 0; i < pageOrder.length; i++) {
          const entry = pageOrder[i]
          if (entry === '__new__' && newFileIndex < newFiles.length) {
            const file = newFiles[newFileIndex++]
            const fileName = `${i + 1}.${file.extname}`
            await file.move(dir, { name: fileName, overwrite: true })
            finalPages.push(`/content/${series.contentType?.slug || 'manga'}/${series.slug}/chapters/${data.number}/${fileName}`)
          }
        }
      } else if (newFiles.length > 0) {
        // Fallback: no page_order, just use files in order
        await mkdir(dir, { recursive: true })
        for (let i = 0; i < newFiles.length; i++) {
          const file = newFiles[i]
          const fileName = `${i + 1}.${file.extname}`
          await file.move(dir, { name: fileName, overwrite: true })
          finalPages.push(`/content/${series.contentType?.slug || 'manga'}/${series.slug}/chapters/${data.number}/${fileName}`)
        }
      }

      content = { type: 'images', pages: finalPages }
    }

    const timestamp = now()

    await Chapter.create({
      seriesId: data.series_id,
      number: data.number,
      title: data.title || null,
      content,
      publishedAt: today(),
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    // Update series updatedAt
    series.updatedAt = timestamp
    await series.save()

    session.flash('success', 'Bölüm eklendi')
    return response.redirect('/admin/bolumler')
  }

  async edit({ view, params }: HttpContext) {
    const chapter = await Chapter.query()
      .where('id', params.id)
      .preload('series', (q) => q.preload('contentType'))
      .firstOrFail()

    const seriesList = await SeriesModel.query()
      .preload('contentType')
      .orderBy('title', 'asc')

    const seriesContentTypeMap: Record<number, string> = {}
    for (const s of seriesList) {
      seriesContentTypeMap[s.id] = s.contentType?.slug || 'manga'
    }

    const currentContentType = chapter.series?.contentType?.slug || 'manga'

    return view.render('pages/admin/chapters/form', {
      title: 'Bölüm Düzenle',
      chapter,
      seriesList,
      seriesContentTypeMap,
      currentContentType,
    })
  }

  async update({ request, params, session, response }: HttpContext) {
    const chapter = await Chapter.findOrFail(params.id)
    const data = await request.validateUsing(chapterValidator)

    const existing = await Chapter.query()
      .where('seriesId', data.series_id)
      .where('number', data.number)
      .whereNot('id', chapter.id)
      .first()

    if (existing) {
      session.flash('error', `Bu seride ${data.number}. bölüm zaten mevcut`)
      return response.redirect(`/admin/bolumler/${chapter.id}/duzenle`)
    }

    const series = await SeriesModel.query()
      .where('id', data.series_id)
      .preload('contentType')
      .firstOrFail()

    const isNovel = series.contentType?.slug === 'novel'

    if (isNovel) {
      chapter.content = { type: 'text', text: data.text_content || '' }
    } else {
      const pageOrder: string[] = JSON.parse(request.input('page_order', '[]'))
      const newFiles = request.files('pages', { size: '10mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] })
      const hasChanges = pageOrder.length > 0 || newFiles.length > 0

      if (hasChanges) {
        const dir = join(
          app.publicPath(),
          'content',
          series.contentType?.slug || 'manga',
          series.slug,
          'chapters',
          String(data.number)
        )
        await mkdir(dir, { recursive: true })

        const finalPages: string[] = []
        let newFileIndex = 0

        if (pageOrder.length > 0) {
          for (let i = 0; i < pageOrder.length; i++) {
            const entry = pageOrder[i]
            if (entry === '__new__' && newFileIndex < newFiles.length) {
              const file = newFiles[newFileIndex++]
              const fileName = `${i + 1}.${file.extname}`
              await file.move(dir, { name: fileName, overwrite: true })
              finalPages.push(`/content/${series.contentType?.slug || 'manga'}/${series.slug}/chapters/${data.number}/${fileName}`)
            } else if (entry !== '__new__') {
              // Existing page URL — keep it
              finalPages.push(entry)
            }
          }
        } else if (newFiles.length > 0) {
          // Fallback: no page_order, just append new files
          const existingPages = (chapter.content as any)?.pages || []
          finalPages.push(...existingPages)
          for (let i = 0; i < newFiles.length; i++) {
            const file = newFiles[i]
            const fileName = `${existingPages.length + i + 1}.${file.extname}`
            await file.move(dir, { name: fileName, overwrite: true })
            finalPages.push(`/content/${series.contentType?.slug || 'manga'}/${series.slug}/chapters/${data.number}/${fileName}`)
          }
        }

        chapter.content = { type: 'images', pages: finalPages }
      }
    }

    const timestamp = now()
    chapter.seriesId = data.series_id
    chapter.number = data.number
    chapter.title = data.title || null
    chapter.updatedAt = timestamp

    await chapter.save()

    // Update series updatedAt
    series.updatedAt = timestamp
    await series.save()

    session.flash('success', 'Bölüm güncellendi')
    return response.redirect('/admin/bolumler')
  }

  async destroy({ params, session, response }: HttpContext) {
    const chapter = await Chapter.findOrFail(params.id)
    await chapter.delete()
    session.flash('success', 'Bölüm silindi')
    return response.redirect('/admin/bolumler')
  }
}
