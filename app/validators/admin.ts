import site, { accessLevelKeys } from '#config/site'
import vine from '@vinejs/vine'

const relationIds = () =>
  vine.array(vine.number().positive().withoutDecimals()).maxLength(100).optional()

export const seriesValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(255),
    description: vine.string().trim().minLength(1).maxLength(50000),
    content_type_id: vine.number().positive().withoutDecimals(),
    status: vine.enum(site.statuses),
    translation_status: vine.enum(site.translationStatuses),
    publication_year: vine.number().withoutDecimals().range([1900, 2100]),
    age_rating: vine.enum(site.ageRatings).optional(),
    alternative_titles: vine.string().maxLength(5000).optional(),
    featured: vine.enum(['on']).optional(),
    featured_description: vine.string().maxLength(5000).optional(),
    draft: vine.enum(['on']).optional(),
    access: vine.enum(accessLevelKeys).optional(),
    keywords: vine.string().maxLength(5000).optional(),
    genres: relationIds(),
    authors: relationIds(),
    artists: relationIds(),
  })
)

export const chapterValidator = vine.compile(
  vine.object({
    series_id: vine.number().positive().withoutDecimals(),
    number: vine.number().withoutDecimals().range([0, 1000000]),
    title: vine.string().trim().maxLength(255).optional(),
    draft: vine.enum(['on']).optional(),
    access: vine.enum(accessLevelKeys).optional(),
    warning: vine.string().trim().maxLength(500).optional(),
    text_content: vine.string().maxLength(1000000).optional(),
    page_order: vine.string().maxLength(100000).optional(),
    /** Video episodes: JSON list of sources, checked by `parseSources` (video_service). */
    sources: vine.string().maxLength(200000).optional(),
  })
)
