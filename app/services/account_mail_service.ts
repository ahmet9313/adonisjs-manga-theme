import type { HttpContext } from '@adonisjs/core/http'
import emitter from '@adonisjs/core/services/emitter'
import logger from '@adonisjs/core/services/logger'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import site from '#config/site'
import type User from '#models/user'
import tokens, { type AccountTokenType } from '#services/account_token_service'

// Mails are queued in memory and sent after the response, so a slow or broken mail server never
// delays a page and the response time does not tell whether an address has an account.
emitter.on('queued:mail:error', ({ error, mailerName }) => {
  logger.error({ err: error, mailer: mailerName }, 'Hesap e-postası gönderilemedi')
})

/**
 * Public address for links in mails: APP_URL when set (recommended in production, behind a
 * proxy or with several host names), otherwise the address this request came to.
 */
export function publicUrl(request: HttpContext['request'], path: string) {
  const base = (env.get('APP_URL') || `${request.protocol()}://${request.host()}`).replace(
    /\/+$/,
    ''
  )
  return `${base}${path}`
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
    const token = await tokens.issue(user, 'reset')
    await send({
      to: user.email,
      subject: `${siteName()} parola sıfırlama`,
      heading: 'Parolanı sıfırla',
      intro: `Merhaba ${user.fullName}, hesabın (@${user.username}) için parola sıfırlama isteği aldık. Yeni parolanı aşağıdaki bağlantıdan belirleyebilirsin.`,
      action: { label: 'Yeni parola belirle', url: publicUrl(request, `/sifre-sifirla/${token}`) },
      note: `Bağlantı ${site.accountLinks.resetMinutes} dakika geçerlidir ve yalnız bir kez kullanılabilir. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; parolan değişmez.`,
    })
  }

  /** `verify` after registration, `email_change` after a new address in the settings. */
  async verification(
    user: User,
    request: HttpContext['request'],
    type: Exclude<AccountTokenType, 'reset'> = 'verify'
  ) {
    const token = await tokens.issue(user, type)
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
      action: {
        label: 'E-postamı doğrula',
        url: publicUrl(request, `/eposta-dogrula/${token}`),
      },
      note: `Bağlantı ${site.accountLinks.verifyDays} gün geçerlidir. Bu hesabı sen açmadıysan bu e-postayı yok sayabilirsin.`,
    })
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
