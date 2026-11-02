import env from '#start/env'
import site from '#config/site'
import { defineConfig, transports } from '@adonisjs/mail'
import { LogTransport } from '#services/log_mail_transport'

/**
 * Account mails (password reset, e-mail verification, e-mail change notice). Every setting is
 * optional: with SMTP_HOST set the mails go out through that server, otherwise they are written
 * to the log (and printed in the console during development), so the site works without a mail
 * provider. Tests swap the mailer for `mail.fake()`.
 */
const smtpPort = env.get('SMTP_PORT') ?? 587
const smtpUser = env.get('SMTP_USERNAME')

const mailConfig = defineConfig({
  default: env.get('SMTP_HOST') ? 'smtp' : 'log',

  from: {
    address: env.get('MAIL_FROM_ADDRESS') || 'no-reply@mangahub.local',
    name: env.get('MAIL_FROM_NAME') || site.name,
  },

  mailers: {
    smtp: transports.smtp({
      host: env.get('SMTP_HOST') || 'localhost',
      port: smtpPort,
      // Port 465 speaks TLS from the start; 587/25 upgrade with STARTTLS when the server offers it.
      secure: Number(smtpPort) === 465,
      ...(smtpUser
        ? { auth: { type: 'login' as const, user: smtpUser, pass: env.get('SMTP_PASSWORD') || '' } }
        : {}),
    }),
    log: () => new LogTransport(),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
