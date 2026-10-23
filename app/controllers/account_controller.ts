import type { HttpContext } from '@adonisjs/core/http'
import hash from '@adonisjs/core/services/hash'
import User from '#models/user'
import comments from '#services/comment_service'
import db from '@adonisjs/lucid/services/db'
import {
  accountValidator,
  assertUniqueIdentity,
  passwordValidator,
  profileUrl,
  profileValidator,
  signOutOtherDevices,
} from '#services/account_service'
import progress from '#services/progress_service'
import cards from '#services/card_service'
import cosmetics from '#services/cosmetic_service'
import reviews from '#services/review_service'
import notifications from '#services/notification_service'
import { recordAttempt, takeAttempt, tooManyAttempts } from '#services/throttle'
import { now } from '#services/input_service'
import { removeContentFile, saveImage, invalidField } from '#services/upload_service'
import accountMail from '#services/account_mail_service'

const extnames = ['jpg', 'jpeg', 'png', 'webp']
const imageRules = {
  avatar: { size: '3mb', extnames },
  banner: { size: '6mb', extnames },
}

export default class AccountController {
  /** Public member profile. */
  async show({ view, params, auth, response }: HttpContext) {
    const member = await User.query()
      .where('username', String(params.username).toLowerCase())
      .first()
    if (!member || member.bannedAt)
      return response.status(404).send(await view.render('pages/errors/not_found'))
    const [recentComments, recentReviews, board, stats, liked, collection, inventory] =
      await Promise.all([
        comments.recentByUser(member.id, 12),
        reviews.recentByUser(member.id, 12),
        progress.badgeBoard(member),
        this.stats(member.id),
        auth.user
          ? db.from('profile_likes').where({ user_id: auth.user.id, member_id: member.id }).first()
          : null,
        cards.collection(member.id),
        cosmetics.inventory(member),
      ])
    return view.render('pages/profile/show', {
      title: `${member.fullName} (@${member.username})`,
      member,
      recentComments,
      recentReviews,
      inventory,
      equipped: Object.fromEntries(
        Object.entries(inventory).map(([kind, items]) => [
          kind,
          items.find((item) => item.equipped) ?? null,
        ])
      ),
      earnedBadges: board.filter((badge) => badge.earnedAt),
      stats,
      liked: Boolean(liked),
      showcase: collection.cards.filter((card) => card.count > 0).slice(0, 12),
      cardTotal: collection.cards.length,
      isOwner: auth.user?.id === member.id,
    })
  }

  private async stats(userId: number) {
    const count = async (table: string, extra?: (query: any) => void) => {
      const query = db.from(table).where('user_id', userId)
      extra?.(query)
      const [row] = await query.count('* as total')
      return Number(row.total)
    }
    const [chapters, commentCount, replyCount, cardCount, reviewCount, ratingCount] =
      await Promise.all([
        count('chapter_reads'),
        count('comments', (query) => query.whereNull('deleted_at')),
        count('comments', (query) => query.whereNull('deleted_at').whereNotNull('parent_id')),
        count('user_cards'),
        count('series_reviews', (query) => query.whereNotNull('body').whereNot('body', '')),
        count('series_reviews'),
      ])
    // Replies other people wrote under this member's comments, and the votes those earned.
    const [received] = await db
      .from('comments as reply')
      .join('comments as parent', 'parent.id', 'reply.parent_id')
      .where('parent.user_id', userId)
      .whereNot('reply.user_id', userId)
      .whereNull('reply.deleted_at')
      .count('* as total')
    const [likes] = await db
      .from('comments')
      .where('user_id', userId)
      .whereNull('deleted_at')
      .sum('like_count as total')
    const [average] = await db
      .from('series_reviews')
      .where('user_id', userId)
      .avg('rating as value')
    return {
      chapters,
      comments: commentCount,
      replies: replyCount,
      roots: commentCount - replyCount,
      repliesReceived: Number(received.total),
      likes: Number(likes.total || 0),
      cards: cardCount,
      reviews: reviewCount,
      ratings: ratingCount,
      averageRating: average.value ? Math.round(Number(average.value) * 10) / 10 : 0,
    }
  }

  /** Profile like toggle (one per reader and profile). */
  async like({ params, auth, response }: HttpContext) {
    const user = auth.user!
    const member = await User.query()
      .where('username', String(params.username).toLowerCase())
      .first()
    if (!member || member.bannedAt) return response.notFound({ error: 'Üye bulunamadı' })
    if (member.id === user.id)
      return response.unprocessableEntity({ error: 'Kendi profilini beğenemezsin.' })
    const key = `profile-like:${user.id}`
    if (tooManyAttempts(key, 20)) return response.tooManyRequests({ error: 'Biraz yavaşla.' })
    recordAttempt(key, 60 * 1000)
    const liked = await db.transaction(async (trx) => {
      const existing = await trx
        .from('profile_likes')
        .where({ user_id: user.id, member_id: member.id })
        .first()
      if (existing) {
        await trx.from('profile_likes').where('id', existing.id).delete()
        await trx
          .from('users')
          .where('id', member.id)
          .where('profile_like_count', '>', 0)
          .decrement('profile_like_count', 1)
        return false
      }
      await trx
        .table('profile_likes')
        .insert({ user_id: user.id, member_id: member.id, created_at: now() })
      await trx.from('users').where('id', member.id).increment('profile_like_count', 1)
      return true
    })
    await member.refresh()
    if (liked) {
      const already = await db
        .from('notifications')
        .where({ user_id: member.id, category: 'activity', link: profileUrl(user) })
        .first()
      if (!already)
        await notifications.notify(member.id, 'activity', {
          title: `${user.fullName} profilini beğendi`,
          body: `@${user.username} profilini beğendi.`,
          link: profileUrl(user),
        })
      await progress.evaluate(member)
    }
    return { liked, count: member.profileLikeCount }
  }

  async settings({ view, auth }: HttpContext) {
    return view.render('pages/profile/settings', { title: 'Ayarlar', member: auth.user! })
  }

  async updateProfile({ request, auth, session, response }: HttpContext) {
    const data = await request.validateUsing(profileValidator)
    const user = auth.user!
    user.fullName = data.full_name
    user.bio = data.bio || null
    user.updatedAt = now()
    await user.save()
    session.flash('success', 'Profil güncellendi')
    return response.redirect('/ayarlar')
  }

  /** The current password, at most 5 tries per 15 minutes (a stolen session cannot guess it). */
  private async checkPassword(user: User, password: string) {
    if (!takeAttempt(`current-password:${user.id}`, 5, 15 * 60 * 1000))
      invalidField('current_password', 'Çok fazla deneme yaptınız; 15 dakika sonra tekrar deneyin.')
    if (!(await hash.verify(user.password, password)))
      invalidField('current_password', 'Mevcut parola hatalı.')
  }

  async updateAccount(ctx: HttpContext) {
    const { request, auth, session, response } = ctx
    const data = await request.validateUsing(accountValidator)
    const user = auth.user!
    const email = data.email.toLowerCase()
    await this.checkPassword(user, data.current_password)
    await assertUniqueIdentity(null, email, user.id)
    const previous = user.email
    const changed = email !== previous
    user.email = email
    // A new address is unconfirmed until its mailed link is opened (account_mail_service).
    if (changed) user.emailVerifiedAt = null
    user.updatedAt = now()
    await user.save()
    if (changed) {
      await signOutOtherDevices(user, ctx)
      await accountMail.verification(user, request, 'email_change')
      await accountMail.emailChanged(user, previous)
    }
    session.flash(
      'success',
      changed
        ? `E-posta adresi güncellendi. ${email} adresine gönderdiğimiz bağlantıyla doğrula.`
        : 'E-posta adresi güncellendi'
    )
    return response.redirect('/ayarlar')
  }

  async updatePassword(ctx: HttpContext) {
    const { request, auth, session, response } = ctx
    const data = await request.validateUsing(passwordValidator)
    const user = auth.user!
    await this.checkPassword(user, data.current_password)
    user.password = data.password
    user.updatedAt = now()
    await user.save()
    await signOutOtherDevices(user, ctx)
    session.flash('success', 'Parola değiştirildi; diğer cihazlardaki oturumlar kapatıldı.')
    return response.redirect('/ayarlar')
  }

  /** Avatar/banner upload. Answers JSON for the in-page cropper and redirects for plain forms. */
  async uploadImage(kind: 'avatar' | 'banner', { request, auth, session, response }: HttpContext) {
    const user = auth.user!
    if (!takeAttempt(`profile-image:${user.id}`, 10, 10 * 60 * 1000))
      return this.respond(
        request,
        response,
        session,
        kind,
        429,
        'Çok sık görsel yüklediniz; biraz bekleyin.'
      )
    const file = request.file(kind, imageRules[kind])
    if (!file) {
      return this.respond(request, response, session, kind, 422, 'Bir görsel seçin.')
    }
    let path: string
    try {
      path = await saveImage(file, [kind === 'avatar' ? 'avatars' : 'banners'])
    } catch {
      return this.respond(
        request,
        response,
        session,
        kind,
        422,
        `Geçerli bir JPG, PNG veya WebP görseli seçin (en fazla ${imageRules[kind].size.replace('mb', ' MB')}).`
      )
    }
    const previous = user[kind]
    user[kind] = path
    user.updatedAt = now()
    await user.save()
    await removeContentFile(previous)
    return this.respond(request, response, session, kind, 200, undefined, path)
  }

  async removeImage(kind: 'avatar' | 'banner', { request, auth, session, response }: HttpContext) {
    const user = auth.user!
    const previous = user[kind]
    user[kind] = null
    user.updatedAt = now()
    await user.save()
    await removeContentFile(previous)
    return this.respond(request, response, session, kind, 200, undefined, null)
  }

  async uploadAvatar(ctx: HttpContext) {
    return this.uploadImage('avatar', ctx)
  }

  async uploadBanner(ctx: HttpContext) {
    return this.uploadImage('banner', ctx)
  }

  async removeAvatar(ctx: HttpContext) {
    return this.removeImage('avatar', ctx)
  }

  async removeBanner(ctx: HttpContext) {
    return this.removeImage('banner', ctx)
  }

  private respond(
    request: HttpContext['request'],
    response: HttpContext['response'],
    session: HttpContext['session'],
    kind: string,
    status: number,
    error?: string,
    url?: string | null
  ) {
    if (request.accepts(['html', 'json']) === 'json') {
      return response.status(status).json(error ? { error } : { [kind]: url ?? null })
    }
    session.flash(error ? 'error' : 'success', error || 'Görsel güncellendi')
    return response.redirect('/ayarlar')
  }
}
