import type { HttpContext } from '@adonisjs/core/http'
import hash from '@adonisjs/core/services/hash'
import vine from '@vinejs/vine'
import accountData from '#services/account_data_service'
import { SESSION_STAMP } from '#services/account_service'
import { takeAttempt } from '#services/throttle'
import { invalidField } from '#services/upload_service'

const deleteValidator = vine.compile(
  vine.object({
    delete_password: vine.string().minLength(1).maxLength(255),
    confirm_username: vine.string().trim().minLength(1).maxLength(40),
    delete_comments: vine.enum(['on']).optional(),
  })
)

/** Settings → Güvenlik: "Verilerimi indir" and "Hesabımı sil" (KVKK). */
export default class AccountDataController {
  async export({ auth, session, response }: HttpContext) {
    const user = auth.user!
    if (!takeAttempt(`account-export:${user.id}`, 5, 60 * 60 * 1000)) {
      session.flash(
        'error',
        'Verilerini kısa süre içinde çok kez indirdin. Biraz sonra tekrar dene.'
      )
      return response.redirect('/ayarlar#security')
    }
    const data = await accountData.export(user)
    const day = new Date().toISOString().slice(0, 10)
    response.header('Content-Type', 'application/json; charset=utf-8')
    response.header('Cache-Control', 'no-store')
    response.attachment(`verilerim-${user.username}-${day}.json`)
    return response.send(JSON.stringify(data, null, 2))
  }

  async destroy({ request, auth, session, response }: HttpContext) {
    const user = auth.user!
    const data = await request.validateUsing(deleteValidator)
    // Same budget as the other "current password" forms (account_controller.checkPassword).
    if (!takeAttempt(`current-password:${user.id}`, 5, 15 * 60 * 1000))
      invalidField('delete_password', 'Çok fazla deneme yaptınız; 15 dakika sonra tekrar deneyin.')
    if (!(await hash.verify(user.password, data.delete_password)))
      invalidField('delete_password', 'Parola hatalı.')
    if (data.confirm_username.toLowerCase() !== user.username)
      invalidField('confirm_username', `Onaylamak için kullanıcı adını (${user.username}) yaz.`)
    if (await accountData.isLastAdmin(user)) {
      session.flash(
        'error',
        'Sitenin tek yöneticisi olduğun için hesabını silemezsin. Önce başka bir hesaba yönetici rolü ver.'
      )
      return response.redirect('/ayarlar#security')
    }

    await accountData.remove(user, { deleteComments: data.delete_comments === 'on' })
    await auth.use('web').logout()
    session.forget(SESSION_STAMP)
    session.flash('success', 'Hesabın ve kişisel verilerin silindi. Yolun açık olsun!')
    return response.redirect('/')
  }
}
