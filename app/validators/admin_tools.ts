import vine from '@vinejs/vine'
import adminTools from '#config/admin_tools'

/** Bulk chapter import (JSON): the chapters chosen in the preview with their final numbers. */
export const bulkImportValidator = vine.compile(
  vine.object({
    token: vine.string().uuid(),
    series_id: vine.number().positive().withoutDecimals(),
    mode: vine.enum(['publish', 'draft']),
    conflict: vine.enum(['skip', 'overwrite']),
    bump: vine.boolean(),
    notify: vine.boolean(),
    chapters: vine
      .array(
        vine.object({
          key: vine.string().maxLength(1000).nullable().optional(),
          number: vine.number().withoutDecimals().range([0, 1000000]),
          title: vine.string().trim().maxLength(255).nullable().optional(),
        })
      )
      .minLength(1)
      .maxLength(adminTools.bulk.maxChapters),
  })
)
