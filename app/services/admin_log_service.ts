import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import adminTools, { type AdminLogAction, type AdminLogTarget } from '#config/admin_tools'
import { now } from '#services/input_service'

/** Old rows are pruned at most this often per process. */
const pruneEveryMs = 3_600_000

/**
 * Activity log of the administration panel. Writing never fails the change it describes: a
 * database error is logged and swallowed.
 */
class AdminLogService {
  private prunedAt = 0

  async record(
    user: { id: number } | null | undefined,
    action: AdminLogAction,
    targetType: AdminLogTarget,
    targetId: number | null,
    summary: string
  ) {
    try {
      await db.table('admin_logs').insert({
        user_id: user?.id ?? null,
        action,
        target_type: targetType,
        target_id: targetId,
        summary: summary.slice(0, 500),
        created_at: now(),
      })
      await this.prune()
    } catch (error) {
      logger.error({ err: error }, 'Yönetim etkinliği kaydedilemedi')
    }
  }

  /** Drops rows older than the retention period; runs at most once an hour. */
  async prune(force = false) {
    const time = Date.now()
    if (!force && time - this.prunedAt < pruneEveryMs) return
    this.prunedAt = time
    const cutoff = new Date(time - adminTools.log.retentionDays * 86_400_000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ')
    await db.from('admin_logs').where('created_at', '<', cutoff).delete()
  }
}

export default new AdminLogService()
