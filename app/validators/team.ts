import vine, { SimpleMessagesProvider } from '@vinejs/vine'
import teams, { teamRoleKeys } from '#config/teams'

/** http(s) addresses only (no javascript:, data: …). */
const link = () =>
  vine
    .string()
    .trim()
    .maxLength(500)
    .url({ require_protocol: true, protocols: ['http', 'https'] })
    .optional()

/** Admin → Ekipler form; members are comma separated usernames per role (`members_<role>`). */
export const teamValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(80),
    description: vine.string().trim().maxLength(5000).optional(),
    discord_url: link(),
    website_url: link(),
    other_url: link(),
    recruiting: vine.enum(['on']).optional(),
    recruitment_text: vine.string().trim().maxLength(5000).optional(),
    remove_logo: vine.enum(['on']).optional(),
    ...Object.fromEntries(
      teamRoleKeys.map((role) => [`members_${role}`, vine.string().maxLength(2000).optional()])
    ),
  })
)

teamValidator.messagesProvider = new SimpleMessagesProvider(
  {
    required: '{{ field }} alanı zorunludur.',
    string: '{{ field }} metin olmalıdır.',
    minLength: '{{ field }} en az {{ min }} karakter olmalıdır.',
    maxLength: '{{ field }} en fazla {{ max }} karakter olabilir.',
    enum: '{{ field }} geçersiz bir değer içeriyor.',
    url: '{{ field }} http:// veya https:// ile başlayan geçerli bir adres olmalı.',
  },
  {
    name: 'Ekip adı',
    description: 'Açıklama',
    discord_url: teams.links.discord_url.label,
    website_url: teams.links.website_url.label,
    other_url: teams.links.other_url.label,
    recruitment_text: 'Alım metni',
    ...Object.fromEntries(
      teamRoleKeys.map((role) => [`members_${role}`, teams.roles[role].plural])
    ),
  }
)
