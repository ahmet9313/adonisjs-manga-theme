import type { HttpContext } from '@adonisjs/core/http'
import emitter from '@adonisjs/core/services/emitter'
import logger from '@adonisjs/core/services/logger'
import mail from '@adonisjs/mail/services/main'
import seo from '#services/seo_service'
import site from '#config/site'
import type User from '#models/user'
import tokens, { type AccountTokenType } from '#services/account_token_service'

// Mails are queued in memory and sent after the response, so a slow or broken mail server never
// delays a page and the response time does not tell whether an address has an account.
emitter.on('queued:mail:error', ({ error, mailerName }) => {
  logger.error({ err: error, mailer: mailerName }, 'Hesap e-postası gönderilemedi')
})

/**
 * Public address for links in mails: Admin → Tema → Genel → "Site adresi", then APP_URL, then
 * the address this request came to when it is one of the server's own names. Null when none
 * applies: the request's Host header alone is not trusted with a login link
 * (seo_service.mailOrigin), so the mail is not sent and the reason is logged.
 */
export function publicUrl(request: HttpContext['request'], path: string) {
  const origin = seo.mailOrigin(request)
  if (origin) return seo.absolute(path, origin)
  logger.error(
    { host: request.host() },
    'Hesap e-postası gönderilmedi: site adresi ayarlı değil. Yönetim → Tema → Genel → "Site adresi" alanını doldurun ya da .env dosyasına APP_URL yazın.'
  )
  return null
}

/** Site name from Admin → Tema → Genel (settings_service keeps `site.name` in step). */
function siteName() {
  return site.name
}

interface Letter {
  to: string
  subject: string
  heading: string
  intro: string
  action?: { label: string; url: string }
  note?: string
}

async function send(letter: Letter) {
  const data = { ...letter, siteName: siteName() }
  await mail.sendLater((message) => {
    message
      .to(letter.to)
      .subject(letter.subject)
      .htmlView('emails/account', data)
      .textView('emails/account_text', data)
  })
}

/** The three account mails; each issues its own single-use link. */
class AccountMailService {
  async passwordReset(user: User, request: HttpContext['request']) {
    if (!publicUrl(request, '/')) return false
    const token = await tokens.issue(user, 'reset')
    const url = publicUrl(request, `/sifre-sifirla/${token}`)!
    await send({
      to: user.email,
      subject: `${siteName()} parola sıfırlama`,
      heading: 'Parolanı sıfırla',
      intro: `Merhaba ${user.fullName}, hesabın (@${user.username}) için parola sıfırlama isteği aldık. Yeni parolanı aşağıdaki bağlantıdan belirleyebilirsin.`,
      action: { label: 'Yeni parola belirle', url },
      note: `Bağlantı ${site.accountLinks.resetMinutes} dakika geçerlidir ve yalnız bir kez kullanılabilir. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; parolan değişmez.`,
    })
    return true
  }

  /**
   * `verify` after registration, `email_change` after a new address in the settings. False
   * when no link could be built (see publicUrl).
   */
  async verification(
    user: User,
    request: HttpContext['request'],
    type: Exclude<AccountTokenType, 'reset'> = 'verify'
  ) {
    if (!publicUrl(request, '/')) return false
    const token = await tokens.issue(user, type)
    const url = publicUrl(request, `/eposta-dogrula/${token}`)!
    const changed = type === 'email_change'
    await send({
      to: user.email,
      subject: changed
        ? `${siteName()}: yeni e-posta adresini doğrula`
        : `${siteName()}: e-posta adresini doğrula`,
      heading: changed ? 'Yeni e-posta adresini doğrula' : 'E-posta adresini doğrula',
      intro: changed
        ? `Merhaba ${user.fullName}, hesabının (@${user.username}) e-posta adresi bu adresle değiştirildi. Adresin sana ait olduğunu doğrulamak için aşağıdaki bağlantıya bas.`
        : `Hoş geldin, ${user.fullName}! ${siteName()} hesabını (@${user.username}) tamamlamak için e-posta adresini doğrula.`,
      action: { label: 'E-postamı doğrula', url },
      note: `Bağlantı ${site.accountLinks.verifyDays} gün geçerlidir. Bu hesabı sen açmadıysan bu e-postayı yok sayabilirsin.`,
    })
    return true
  }

  /** Sent to the old address when the account's address changes (no link, just a notice). */
  async emailChanged(user: User, previous: string) {
    await send({
      to: previous,
      subject: `${siteName()}: e-posta adresin değiştirildi`,
      heading: 'E-posta adresin değiştirildi',
      intro: `Merhaba ${user.fullName}, hesabının (@${user.username}) e-posta adresi az önce değiştirildi. Bundan sonra giriş ve parola sıfırlama için yeni adres kullanılacak.`,
      note: 'Bu değişikliği sen yapmadıysan hemen parolanı sıfırla ve yöneticilere haber ver.',
    })
  }
}

export default new AccountMailService()
