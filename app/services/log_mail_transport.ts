import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { MailResponse } from '@adonisjs/mail'
import type { MailTransportContract, NodeMailerMessage, Recipient } from '@adonisjs/mail/types'

const addressOf = (recipient: Recipient) =>
  typeof recipient === 'string' ? recipient : recipient.address

/**
 * Mail "transport" used when no SMTP server is configured: the message is written to the log
 * (subject, recipient and the plain-text body with its links), and during development it is
 * also printed as a readable block in the server console, so reset and verification links can
 * be opened without a mail provider.
 */
export class LogTransport implements MailTransportContract {
  async send(message: NodeMailerMessage) {
    const to = (message.to ?? []).map(addressOf)
    const text = typeof message.text === 'string' ? message.text : ''
    logger.info({ mail: { to, subject: message.subject } }, `E-posta (SMTP ayarlı değil):\n${text}`)
    if (app.inDev) {
      const line = '─'.repeat(64)
      console.log(
        `\n${line}\nE-posta → ${to.join(', ')}\nKonu: ${message.subject}\n\n${text}\n${line}\n`
      )
    }
    const messageId = `log-${Date.now()}-${Math.random().toString(36).slice(2)}`
    return new MailResponse(messageId, { from: false, to }, { logged: true })
  }
}
