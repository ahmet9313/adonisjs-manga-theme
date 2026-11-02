import { createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { appKey } from '#config/app'
import site from '#config/site'
import {
  moderationPageSize,
  permanentMute,
  reasonLabel,
  reportReasons,
  type ReportReason,
  type ReportStatus,
  type ReportTarget,
} from '#config/moderation'
import Report from '#models/report'
import Chapter from '#models/chapter'
import Comment from '#models/comment'
import SeriesReview from '#models/series_review'
import type SeriesModel from '#models/series'
import User from '#models/user'
import access from '#services/access_service'
import comments from '#services/comment_service'
import reviews from '#services/review_service'
import notifications from '#services/notification_service'
import { now } from '#services/input_service'
import { parseTimestamp } from '#services/level'

export type ModerationTab = 'chapter' | 'content'
export const tabTargets: Record<ModerationTab, ReportTarget[]> = {
  chapter: ['chapter'],
  content: ['comment', 'review'],
}

/** What a resolved or dismissed report ended with (`reports.resolution`). */
export const resolutionLabels: Record<string, string> = {
  resolved: 'Çözüldü',
  dismissed: 'Reddedildi',
  deleted: 'İçerik silindi',
}

export interface ReportTargetInfo {
  /** Reasons the reporter may pick for this target. */
  reasons: ReportReason[]
  /** Author of a comment or review (nobody can report their own content). */
  ownerId: number | null
}

type Failure = { status: 403 | 404 | 409 | 422; error: string }

const chapterFormat = (chapter: Chapter) =>
  chapter.content?.type === 'video' ? 'video' : chapter.content?.type === 'text' ? 'text' : 'image'

const seriesUrl = (series: SeriesModel) =>
  `/series/${series.contentType?.slug ?? ''}/${series.slug}`

/** Reports from readers and the Admin → Moderasyon queue: grouping, actions and mutes. */
class ModerationService {
  /** Hash of a guest's address: enough to spot a repeated report, useless as an address. */
  ipKey(ip: string) {
    return createHash('sha256')
      .update(`${appKey.release()}:report:${ip}`)
      .digest('hex')
      .slice(0, 40)
  }

  /**
   * The target a visitor wants to report, or why they cannot: drafts and content the visitor
   * may not open answer 404 like everywhere else; deleted comments cannot be reported.
   */
  async target(
    viewer: User | null,
    type: ReportTarget,
    id: number
  ): Promise<ReportTargetInfo | Failure> {
    const missing = { status: 404 as const, error: 'Bildirilecek içerik bulunamadı.' }
    if (type === 'chapter') {
      const chapter = await Chapter.query().where('id', id).preload('series').first()
      if (!chapter || !this.opens(viewer, chapter.series, chapter)) return missing
      return { reasons: reportReasons[chapterFormat(chapter)], ownerId: null }
    }
    if (type === 'comment') {
      const comment = await Comment.query()
        .where('id', id)
        .preload('series')
        .preload('chapter')
        .first()
      if (!comment || comment.deletedAt) return missing
      if (!this.opens(viewer, comment.series, comment.chapterId ? comment.chapter : null))
        return missing
      return { reasons: reportReasons.content, ownerId: comment.userId }
    }
    const review = await SeriesReview.query().where('id', id).preload('series').first()
    if (!review || !access.visible(viewer, { series: review.series })) return missing
    return { reasons: reportReasons.content, ownerId: review.userId }
  }

  private opens(viewer: User | null, series: SeriesModel | null, chapter: Chapter | null) {
    if (!series) return false
    const target = { series, chapter }
    return access.visible(viewer, target) && access.allows(viewer, access.effectiveAccess(target))
  }

  /**
   * Saves a report. One open report per reporter: chapters per reason (a guest is told apart
   * by the hash of their address), comments and reviews per target.
   */
  async create(input: {
    reporter: User | null
    ip: string
    type: ReportTarget
    id: number
    reason: string
    note: string | null
  }): Promise<{ ok: true } | Failure> {
    const info = await this.target(input.reporter, input.type, input.id)
    if ('error' in info) return info
    if (!info.reasons.some((reason) => reason.key === input.reason))
      return { status: 422, error: 'Geçerli bir neden seç.' }
    if (info.ownerId && input.reporter && info.ownerId === input.reporter.id)
      return { status: 422, error: 'Kendi içeriğini şikâyet edemezsin.' }

    const ipKey = this.ipKey(input.ip)
    const duplicate = db
      .from('reports')
      .where({ target_type: input.type, target_id: input.id, status: 'open' })
    if (input.type === 'chapter') duplicate.where('reason', input.reason)
    if (input.reporter) duplicate.where('reporter_id', input.reporter.id)
    else duplicate.whereNull('reporter_id').where('reporter_ip', ipKey)
    if (await duplicate.first())
      return {
        status: 409,
        error:
          input.type === 'chapter'
            ? 'Bu sorunu zaten bildirdin; ekibimiz inceliyor.'
            : 'Bu içeriği zaten şikâyet ettin; ekibimiz inceliyor.',
      }

    const stamp = now()
    await Report.create({
      reporterId: input.reporter?.id ?? null,
      reporterIp: input.reporter ? null : ipKey,
      targetType: input.type,
      targetId: input.id,
      reason: input.reason,
      note: input.note,
      status: 'open',
      createdAt: stamp,
      updatedAt: stamp,
    })
    return { ok: true }
  }

  /** Open targets (not reports) per tab, for the nav badge, the tabs and the dashboard. */
  async openCounts() {
    const rows = await db
      .from('reports')
      .where('status', 'open')
      .select('target_type')
      .select(db.raw('count(distinct target_id) as total'))
      .groupBy('target_type')
    const of = (type: ReportTarget) =>
      Number(rows.find((row) => row.target_type === type)?.total || 0)
    const chapter = of('chapter')
    const content = of('comment') + of('review')
    return { chapter, content, total: chapter + content }
  }

  /** Number shown next to an admin nav item (config/admin_nav.ts → badge). */
  async navBadge(key: string) {
    if (key !== 'reports') return 0
    const counts = await this.openCounts()
    return counts.total
  }

  /** One page of the queue: reports grouped per target, the most recently reported first. */
  async queue(tab: ModerationTab, status: ReportStatus, page: number) {
    const types = tabTargets[tab]
    const scoped = () => db.from('reports').whereIn('target_type', types).where('status', status)
    const [{ total }] = await db
      .from(scoped().distinct('target_type', 'target_id').as('targets'))
      .count('* as total')
    const groupTotal = Number(total)
    const lastPage = Math.max(1, Math.ceil(groupTotal / moderationPageSize))
    const current = Math.min(page, lastPage)
    const groups = await scoped()
      .select('target_type', 'target_id')
      .count('* as total')
      .max('created_at as latest')
      .groupBy('target_type', 'target_id')
      .orderBy('latest', 'desc')
      .orderBy('target_id', 'desc')
      .offset((current - 1) * moderationPageSize)
      .limit(moderationPageSize)

    const idsOf = (type: ReportTarget) =>
      groups.filter((group) => group.target_type === type).map((group) => Number(group.target_id))
    const reports = groups.length
      ? await Report.query()
          .where('status', status)
          .where((query) => {
            for (const type of types) {
              const ids = idsOf(type)
              if (ids.length)
                query.orWhere((inner) => inner.where('targetType', type).whereIn('targetId', ids))
            }
          })
          .preload('reporter')
          .orderBy('createdAt', 'desc')
          .orderBy('id', 'desc')
      : []
    const resolverIds = [
      ...new Set(reports.map((report) => report.resolvedBy).filter(Boolean)),
    ] as number[]
    const [chapters, commentRows, reviewRows, resolvers] = await Promise.all([
      idsOf('chapter').length
        ? Chapter.query()
            .whereIn('id', idsOf('chapter'))
            .preload('series', (series) => series.preload('contentType'))
        : [],
      idsOf('comment').length
        ? Comment.query()
            .whereIn('id', idsOf('comment'))
            .preload('user')
            .preload('chapter')
            .preload('series', (series) => series.preload('contentType'))
        : [],
      idsOf('review').length
        ? SeriesReview.query()
            .whereIn('id', idsOf('review'))
            .preload('user')
            .preload('series', (series) => series.preload('contentType'))
        : [],
      resolverIds.length ? User.query().whereIn('id', resolverIds) : [],
    ])
    const byId = <T extends { id: number }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]))
    const chapterMap = byId(chapters)
    const commentMap = byId(commentRows)
    const reviewMap = byId(reviewRows)
    const resolverMap = byId(resolvers)

    const items = groups.map((group) => {
      const type = group.target_type as ReportTarget
      const id = Number(group.target_id)
      const own = reports.filter((report) => report.targetType === type && report.targetId === id)
      const reasons = new Map<string, number>()
      for (const report of own) reasons.set(report.reason, (reasons.get(report.reason) || 0) + 1)
      const last = own[0]
      return {
        key: `${type}-${id}`,
        type,
        id,
        total: Number(group.total),
        latest: String(group.latest),
        reasons: [...reasons]
          .sort((a, b) => b[1] - a[1])
          .map(([key, count]) => ({ key, label: reasonLabel(key), count })),
        notes: own
          .filter((report) => report.note)
          .map((report) => ({
            text: report.note!,
            reporter: report.reporter?.username ?? null,
            createdAt: report.createdAt,
          })),
        reporters: own.map((report) => report.reporter?.username ?? null),
        resolution: last?.resolution
          ? (resolutionLabels[last.resolution] ?? last.resolution)
          : null,
        resolvedAt: last?.resolvedAt ?? null,
        resolvedBy: last?.resolvedBy ? (resolverMap.get(last.resolvedBy)?.username ?? null) : null,
        target: this.describe(type, id, { chapterMap, commentMap, reviewMap }),
      }
    })
    return { items, total: groupTotal, page: current, lastPage }
  }

  private describe(
    type: ReportTarget,
    id: number,
    maps: {
      chapterMap: Map<number, Chapter>
      commentMap: Map<number, Comment>
      reviewMap: Map<number, SeriesReview>
    }
  ) {
    if (type === 'chapter') {
      const chapter = maps.chapterMap.get(id)
      if (!chapter?.series) return null
      return {
        kind: 'chapter' as const,
        seriesTitle: chapter.series.title,
        number: chapter.number,
        title: chapter.title,
        format: chapterFormat(chapter),
        draft: Boolean(chapter.draft || chapter.series.draft),
        url: `${seriesUrl(chapter.series)}/${chapter.number}`,
        editUrl: `/admin/bolumler/${chapter.id}/duzenle`,
      }
    }
    if (type === 'comment') {
      const comment = maps.commentMap.get(id)
      if (!comment?.series) return null
      const base = seriesUrl(comment.series)
      const chapterNumber = comment.chapterId ? (comment.chapter?.number ?? null) : null
      return {
        kind: 'comment' as const,
        seriesTitle: comment.series.title,
        chapterNumber,
        body: comment.body,
        image: comment.image,
        stickerId: comment.stickerId,
        spoiler: comment.spoiler,
        deleted: Boolean(comment.deletedAt),
        reply: Boolean(comment.parentId),
        createdAt: comment.createdAt,
        author: comment.user ?? null,
        url: `${base}${chapterNumber !== null ? `/${chapterNumber}` : ''}#yorum-${comment.id}`,
      }
    }
    const review = maps.reviewMap.get(id)
    if (!review?.series) return null
    return {
      kind: 'review' as const,
      seriesTitle: review.series.title,
      rating: review.rating,
      title: review.title,
      body: review.body,
      spoiler: review.spoiler,
      createdAt: review.createdAt,
      author: review.user ?? null,
      url: `${seriesUrl(review.series)}#inceleme-${review.id}`,
    }
  }

  /**
   * Closes every open report of a target. Readers who reported a chapter error that got fixed
   * hear about it in their inbox. Returns how many reports changed.
   */
  async close(
    staff: User,
    type: ReportTarget,
    id: number,
    status: 'resolved' | 'dismissed',
    resolution: keyof typeof resolutionLabels = status
  ) {
    const open = await db
      .from('reports')
      .where({ target_type: type, target_id: id, status: 'open' })
      .select('reporter_id')
    if (!open.length) return 0
    const stamp = now()
    await db.from('reports').where({ target_type: type, target_id: id, status: 'open' }).update({
      status,
      resolution,
      resolved_by: staff.id,
      resolved_at: stamp,
      updated_at: stamp,
    })
    if (type === 'chapter' && status === 'resolved') await this.thankReporters(id, open)
    return open.length
  }

  private async thankReporters(chapterId: number, rows: { reporter_id: number | null }[]) {
    const ids = [...new Set(rows.map((row) => row.reporter_id).filter(Boolean))] as number[]
    if (!ids.length) return
    const chapter = await Chapter.query()
      .where('id', chapterId)
      .preload('series', (series) => series.preload('contentType'))
      .first()
    if (!chapter?.series) return
    await notifications.notifyMany(ids, 'system', {
      title: 'Bildirdiğin hata düzeltildi',
      body: `${chapter.series.title}, Bölüm ${chapter.number} için bildirdiğin sorun giderildi. Teşekkürler!`,
      link: `${seriesUrl(chapter.series)}/${chapter.number}`,
    })
  }

  /**
   * Deletes a reported comment or review through its own service (files, reply and rating
   * counters stay right) and resolves its reports. False when it was already gone.
   */
  async removeContent(staff: User, type: 'comment' | 'review', id: number) {
    let removed = false
    if (type === 'comment') {
      const comment = await Comment.find(id)
      if (comment && !comment.deletedAt) {
        await comments.remove(comment)
        removed = true
      }
    } else {
      const review = await SeriesReview.find(id)
      if (review) {
        await reviews.remove(review)
        removed = true
      }
    }
    await this.close(staff, type, id, 'resolved', 'deleted')
    return removed
  }

  /** Staff accounts and the moderator themselves are never muted. */
  canMute(staff: User, member: User) {
    return member.id !== staff.id && !member.isStaff
  }

  /** Mutes a member for `days` days (0: until unmuted) and tells them in the inbox. */
  async mute(member: User, days: number) {
    const until = days
      ? new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 19).replace('T', ' ')
      : permanentMute
    await db.from('users').where('id', member.id).update({ muted_until: until })
    member.mutedUntil = until
    await notifications.notify(member.id, 'system', {
      title: 'Hesabın susturuldu',
      body: days
        ? `${this.untilLabel(until)} tarihine kadar yorum ve inceleme yazamazsın. Okumaya devam edebilirsin.`
        : 'Yorum ve inceleme yazman süresiz olarak kapatıldı. Okumaya devam edebilirsin.',
    })
    return until
  }

  async unmute(member: User) {
    const wasMuted = member.isMuted
    await db.from('users').where('id', member.id).update({ muted_until: null })
    member.mutedUntil = null
    if (wasMuted)
      await notifications.notify(member.id, 'system', {
        title: 'Susturman kaldırıldı',
        body: 'Yeniden yorum ve inceleme yazabilirsin.',
      })
  }

  isPermanent(value: string | null) {
    // Anything from year 9999 on is "süresiz"; the exact second does not matter.
    return Boolean(value && String(value) >= '9999')
  }

  /** "25 Eki 2026 14:30" in the site's time zone, "süresiz" for a permanent mute. */
  untilLabel(value: string | null) {
    if (!value) return ''
    if (this.isPermanent(value)) return 'süresiz'
    const time = parseTimestamp(String(value))
    if (!Number.isFinite(time)) return ''
    return new Date(time).toLocaleString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: site.timezone,
    })
  }

  /** Turkish 403 message for a muted member, or null when they may write. */
  muteError(user: User) {
    if (!user.isMuted) return null
    if (this.isPermanent(user.mutedUntil))
      return 'Hesabın süresiz olarak susturuldu; yorum ve inceleme yazamazsın.'
    return `Hesabın susturuldu: ${this.untilLabel(user.mutedUntil)} tarihine kadar yorum ve inceleme yazamazsın.`
  }
}

export default new ModerationService()
