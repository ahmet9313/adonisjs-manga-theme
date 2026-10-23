import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import {
  blockedWordMax,
  blockedWordsLimit,
  isReportStatus,
  isReportTarget,
  muteDurations,
} from '#config/moderation'
import User from '#models/user'
import moderation, { type ModerationTab } from '#services/moderation_service'
import wordFilter, { blockedWordsKey, parseBlockedWords } from '#services/word_filter_service'
import settings from '#services/settings_service'
import { pageNumber } from '#services/input_service'

const muteValidator = vine.compile(
  vine.object({ days: vine.enum(muteDurations.map((entry) => String(entry.days))) })
)

const wordsValidator = vine.compile(
  vine.object({
    words: vine
      .string()
      .maxLength(blockedWordsLimit * (blockedWordMax + 2))
      .optional(),
  })
)

/** Only admin pages may be the target of the "back" field of the forms on this page. */
function backTo(request: HttpContext['request']) {
  const back = request.input('back')
  return typeof back === 'string' && back.startsWith('/admin/') && !back.startsWith('//')
    ? back
    : '/admin/moderasyon'
}

/**
 * Admin → Moderasyon (administrators and editors): chapter error reports and comment / review
 * complaints grouped per target, actions on them, mutes and the blocked-words list.
 */
export default class ModerationController {
  async index({ view, request }: HttpContext) {
    const tab: ModerationTab = request.input('tab') === 'icerik' ? 'content' : 'chapter'
    const statusInput = request.input('durum')
    const status = isReportStatus(statusInput) ? statusInput : 'open'
    const [queue, counts] = await Promise.all([
      moderation.queue(tab, status, pageNumber(request.input('page'))),
      moderation.openCounts(),
    ])
    return view.render('pages/admin/moderation/index', {
      title: 'Moderasyon',
      tab,
      status,
      queue,
      counts,
      muteDurations,
      blockedWords: wordFilter.words().join('\n'),
      untilLabel: (value: string | null) => moderation.untilLabel(value),
      back: request.url(true),
    })
  }

  async resolve(ctx: HttpContext) {
    return this.closeTarget(ctx, 'resolved')
  }

  async dismiss(ctx: HttpContext) {
    return this.closeTarget(ctx, 'dismissed')
  }

  private async closeTarget(
    { params, request, auth, session, response }: HttpContext,
    status: 'resolved' | 'dismissed'
  ) {
    const type = params.type
    const id = Number(params.id)
    if (!isReportTarget(type) || !Number.isSafeInteger(id)) return response.notFound()
    const changed = await moderation.close(auth.user!, type, id, status)
    if (!changed) session.flash('error', 'Bu içerik için açık bildirim kalmamış.')
    else
      session.flash(
        'success',
        status === 'resolved'
          ? `${changed} bildirim çözüldü olarak kapatıldı.`
          : `${changed} bildirim reddedildi.`
      )
    return response.redirect(backTo(request))
  }

  async destroy({ params, request, auth, session, response }: HttpContext) {
    const type = params.type
    const id = Number(params.id)
    if ((type !== 'comment' && type !== 'review') || !Number.isSafeInteger(id))
      return response.notFound()
    const removed = await moderation.removeContent(auth.user!, type, id)
    const what = type === 'comment' ? 'Yorum' : 'İnceleme'
    session.flash(
      removed ? 'success' : 'error',
      removed ? `${what} silindi ve bildirimleri kapatıldı.` : `${what} zaten silinmiş.`
    )
    return response.redirect(backTo(request))
  }

  async mute({ params, request, auth, session, response }: HttpContext) {
    const member = await User.find(params.id)
    if (!member) {
      session.flash('error', 'Kullanıcı bulunamadı; silinmiş olabilir.')
      return response.redirect(backTo(request))
    }
    const { days } = await request.validateUsing(muteValidator)
    if (!moderation.canMute(auth.user!, member)) {
      session.flash('error', 'Yetkili hesaplar ve kendi hesabın susturulamaz.')
      return response.redirect(backTo(request))
    }
    const until = await moderation.mute(member, Number(days))
    session.flash(
      'success',
      Number(days)
        ? `@${member.username} ${moderation.untilLabel(until)} tarihine kadar susturuldu.`
        : `@${member.username} süresiz olarak susturuldu.`
    )
    return response.redirect(backTo(request))
  }

  async unmute({ params, request, session, response }: HttpContext) {
    const member = await User.find(params.id)
    if (!member) {
      session.flash('error', 'Kullanıcı bulunamadı; silinmiş olabilir.')
      return response.redirect(backTo(request))
    }
    await moderation.unmute(member)
    session.flash('success', `@${member.username} artık yorum ve inceleme yazabilir.`)
    return response.redirect(backTo(request))
  }

  async words({ request, session, response }: HttpContext) {
    const { words } = await request.validateUsing(wordsValidator)
    const list = parseBlockedWords(words ?? '')
    await settings.save({ [blockedWordsKey]: list.join('\n') })
    session.flash(
      'success',
      list.length
        ? `Engellenen kelime listesi kaydedildi (${list.length} ifade).`
        : 'Engellenen kelime listesi temizlendi.'
    )
    return response.redirect(backTo(request))
  }
}
