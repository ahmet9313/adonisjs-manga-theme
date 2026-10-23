import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import {
  colorGroups,
  colorPageLooks,
  colorTokens,
  flagGroups,
  flags,
  fontStacks,
  looks,
  presets,
} from '#config/theme'
import settings from '#services/settings_service'
import theme, {
  colorKey,
  flagKey,
  lightColorKey,
  lookKey,
  CUSTOM_CSS_KEY,
} from '#services/theme_service'
import { invalidField, removeContentFile, saveImage } from '#services/upload_service'
import site, { agePolicyKeys, coverModeKeys, coverRevealKeys } from '#config/site'
import { agePolicyKey, coverPolicyKey } from '#services/settings_service'
import { DISCLAIMER_KEY, socialKey } from '#services/site_content_service'

/** Public paths or http(s) addresses only; blocks `javascript:` and protocol-relative links. */
const link = vine
  .string()
  .trim()
  .maxLength(300)
  .regex(/^(\/(?!\/)|https?:\/\/)\S*$/)
  .optional()

const genelValidator = vine.compile(
  vine.object({
    site_name: vine.string().trim().minLength(2).maxLength(40),
    site_description: vine.string().trim().maxLength(200).optional(),
    logo_url: link,
    logo_mobile_url: link,
    favicon_url: link,
  })
)
const erisimValidator = vine.compile(
  vine.object(
    Object.fromEntries(
      site.ageRatings.map((rating) => [agePolicyKey(rating), vine.enum(agePolicyKeys)])
    )
  )
)
const coverValidator = vine.compile(
  vine.object({
    ...Object.fromEntries(
      site.ageRatings.map((rating) => [coverPolicyKey(rating), vine.enum(coverModeKeys)])
    ),
    cover_reveal: vine.enum(coverRevealKeys),
    cover_placeholder_url: link,
  })
)
/** Tema → Genel, second form: footer disclaimer and social accounts (http(s) only). */
const linksValidator = vine.compile(
  vine.object({
    footer_disclaimer: vine.string().trim().maxLength(400).optional(),
    ...Object.fromEntries(
      site.socialNetworks.map((network) => [
        socialKey(network.key),
        vine
          .string()
          .trim()
          .maxLength(300)
          .regex(/^https?:\/\/[^\s"'<>]+$/)
          .optional(),
      ])
    ),
  })
)
const duyuruValidator = vine.compile(
  vine.object({
    announcement_enabled: vine.enum(['on']).optional(),
    announcement_text: vine.string().trim().maxLength(160).optional(),
    announcement_url: link,
  })
)

/**
 * Images uploaded from the theme pages (logo, phone logo, tab icon, page background). They go to
 * `<content root>/branding/` and the page puts the returned address into the matching field;
 * nothing changes on the site until that page is saved.
 */
const brandImages = {
  logo: { size: '5mb', extnames: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
  logo_mobile: { size: '5mb', extnames: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
  favicon: { size: '1mb', extnames: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'ico'] },
  background: { size: '10mb', extnames: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
  cover_placeholder: { size: '5mb', extnames: ['png', 'jpg', 'jpeg', 'webp'] },
} as const
type BrandImage = keyof typeof brandImages
const brandKeys = () => [
  'logo_url',
  'logo_mobile_url',
  'favicon_url',
  'cover_placeholder_url',
  lookKey('bg_image'),
]

/** Deletes uploaded branding files a save replaced, unless another field still uses them. */
async function removeReplacedBranding(before: string[]) {
  const inUse = new Set(brandKeys().map((key) => settings.get(key)))
  for (const path of new Set(before))
    if (path.startsWith('/content/branding/') && !inUse.has(path)) await removeContentFile(path)
}

const titles = {
  genel: 'Tema: Genel',
  renkler: 'Tema: Renkler',
  gorunum: 'Tema: Düzen ve Görünüm',
  goster: 'Tema: Göster / Gizle',
  duyuru: 'Tema: Duyuru Çubuğu',
  erisim: 'Tema: Yaş ve Erişim',
  gelismis: 'Tema: Gelişmiş',
} as const
type Section = keyof typeof titles
const isSection = (value: string): value is Section => value in titles

/** Effective colours of both schemes and looks (stored or stock) the editors start from. */
const currentColors = () => ({
  dark: Object.fromEntries(
    colorTokens.map((t) => [t.key, settings.get(colorKey(t.key)) || t.default])
  ),
  light: Object.fromEntries(
    colorTokens.map((t) => [t.key, settings.get(lightColorKey(t.key)) || t.light])
  ),
})
const currentLooks = () =>
  Object.fromEntries(looks.map((l) => [l.key, settings.get(lookKey(l.key)) || String(l.default)]))
const currentFlags = () =>
  Object.fromEntries(
    flags.map((f) => {
      const value = settings.get(flagKey(f.key))
      return [f.key, value ? value === '1' : f.default]
    })
  )

export default class ThemeController {
  async show({ view, params, response }: HttpContext) {
    if (!isSection(params.section)) return response.redirect('/admin/tema/genel')
    const section = params.section as Section
    const data: Record<string, unknown> = { title: titles[section] }

    if (section === 'genel' || section === 'duyuru') {
      data.values = Object.fromEntries(
        [
          'site_name',
          'site_description',
          'logo_url',
          'logo_mobile_url',
          'favicon_url',
          'announcement_enabled',
          'announcement_text',
          'announcement_url',
        ].map((key) => [key, settings.get(key)])
      )
      data.links = {
        disclaimer: settings.get(DISCLAIMER_KEY),
        defaultDisclaimer: site.disclaimer,
        social: site.socialNetworks.map((network) => ({
          ...network,
          value: settings.get(socialKey(network.key)),
        })),
      }
    } else if (section === 'renkler') {
      const colors = currentColors()
      data.config = {
        mode: 'colors',
        groups: colorGroups,
        tokens: colorTokens,
        values: colors.dark,
        lightValues: colors.light,
        presets,
        looks: looks.filter((look) => colorPageLooks.includes(look.key)),
        lookValues: currentLooks(),
        stacks: fontStacks,
      }
    } else if (section === 'gorunum') {
      data.config = {
        mode: 'looks',
        looks: looks.filter((look) => !colorPageLooks.includes(look.key)),
        lookValues: currentLooks(),
        stacks: fontStacks,
      }
    } else if (section === 'erisim') {
      // Strictest rating first: that is the one people usually change.
      data.ratings = [...site.ageRatings].reverse().map((rating) => ({
        rating,
        key: agePolicyKey(rating),
        value: settings.agePolicy(rating),
      }))
      data.policies = agePolicyKeys.map((key) => ({ key, label: site.agePolicyLabels[key] }))
      data.coverRatings = [...site.ageRatings].reverse().map((rating) => ({
        rating,
        key: coverPolicyKey(rating),
        value: settings.coverPolicy(rating),
      }))
      data.coverModes = coverModeKeys.map((key) => ({ key, ...site.coverModes[key] }))
      data.coverReveal = settings.get('cover_reveal')
      data.coverReveals = coverRevealKeys.map((key) => ({ key, ...site.coverReveals[key] }))
      data.coverPlaceholder = settings.get('cover_placeholder_url')
    } else if (section === 'goster') {
      data.groups = Object.entries(flagGroups).map(([key, label]) => ({
        key,
        label,
        flags: flags.filter((flag) => flag.group === key),
      }))
      data.values = currentFlags()
    } else {
      data.customCss = settings.get(CUSTOM_CSS_KEY)
      data.exported = JSON.stringify(this.snapshot(), null, 2)
    }
    return view.render(`pages/admin/theme/${section}`, data)
  }

  async update({ request, params, session, response }: HttpContext) {
    if (!isSection(params.section)) return response.redirect('/admin/tema/genel')
    const section = params.section as Section
    const body = request.all()
    let entries: Record<string, string> = {}

    if (section === 'genel' && body.part === 'links') {
      const data = (await request.validateUsing(linksValidator)) as Record<string, string>
      entries = Object.fromEntries(
        [DISCLAIMER_KEY, ...site.socialNetworks.map((network) => socialKey(network.key))].map(
          (key) => [key, data[key] ?? '']
        )
      )
    } else if (section === 'genel') {
      const data = await request.validateUsing(genelValidator)
      entries = {
        site_name: data.site_name,
        site_description: data.site_description ?? '',
        logo_url: data.logo_url ?? '',
        logo_mobile_url: data.logo_mobile_url ?? '',
        favicon_url: data.favicon_url ?? '',
      }
    } else if (section === 'duyuru') {
      const data = await request.validateUsing(duyuruValidator)
      entries = {
        announcement_enabled: data.announcement_enabled ? '1' : '',
        announcement_text: data.announcement_text ?? '',
        announcement_url: data.announcement_url ?? '',
      }
    } else if (section === 'renkler') {
      entries = {
        ...theme.readColors(body),
        ...theme.readColors(body, { light: true }),
        ...theme.readLooks(body, colorPageLooks),
      }
    } else if (section === 'gorunum') {
      entries = theme.readLooks(
        body,
        looks.map((l) => l.key).filter((key) => !colorPageLooks.includes(key))
      )
    } else if (section === 'erisim' && body.part === 'covers') {
      const {
        cover_reveal: reveal,
        cover_placeholder_url: placeholder,
        ...rules
      } = await request.validateUsing(coverValidator)
      entries = {
        ...(rules as Record<string, string>),
        cover_reveal: reveal,
        cover_placeholder_url: placeholder ?? '',
      }
    } else if (section === 'erisim') {
      entries = (await request.validateUsing(erisimValidator)) as Record<string, string>
    } else if (section === 'goster') {
      entries = theme.readFlags(body)
    } else {
      entries = theme.readCss(body.custom_css)
    }

    const before = brandKeys().map((key) => settings.get(key))
    await settings.save(entries)
    await removeReplacedBranding(before)
    session.flash('success', 'Tema ayarları kaydedildi')
    return response.redirect(`/admin/tema/${section}`)
  }

  /** POST /admin/tema/gorsel (`image`, `kind`): stores one branding image, answers `{ url }`. */
  async uploadImage({ request, response }: HttpContext) {
    const kind = String(request.input('kind', '')) as BrandImage
    if (!(kind in brandImages))
      return response.unprocessableEntity({ error: 'Geçersiz görsel türü.' })
    const rules = brandImages[kind]
    const file = request.file('image', { size: rules.size, extnames: [...rules.extnames] })
    if (!file) return response.unprocessableEntity({ error: 'Bir görsel seçin.' })
    if (!file.isValid)
      return response.unprocessableEntity({
        error: `Görsel ${rules.extnames
          .filter((ext) => ext !== 'jpeg')
          .map((ext) => ext.toUpperCase())
          .join(', ')} olmalı ve ${rules.size.toUpperCase()} sınırını aşmamalı.`,
      })
    return response.send({ url: await saveImage(file, ['branding']) })
  }

  /** Every theme value as a portable document (`colors` is the dark scheme). */
  private snapshot() {
    const colors = currentColors()
    return {
      colors: colors.dark,
      lightColors: colors.light,
      looks: Object.fromEntries(
        looks.map((l) => [l.key, settings.get(lookKey(l.key)) || String(l.default)])
      ),
      flags: currentFlags(),
      css: settings.get(CUSTOM_CSS_KEY),
    }
  }

  async export({ response }: HttpContext) {
    response.header('Content-Disposition', 'attachment; filename="tema.json"')
    response.header('Content-Type', 'application/json; charset=utf-8')
    return JSON.stringify(this.snapshot(), null, 2)
  }

  async import({ request, session, response }: HttpContext) {
    let data: {
      colors?: Record<string, unknown>
      lightColors?: Record<string, unknown>
      looks?: Record<string, unknown>
      flags?: Record<string, unknown>
      css?: unknown
    }
    try {
      data = JSON.parse(String(request.input('theme_json') ?? ''))
    } catch {
      return invalidField('theme_json', "Geçerli bir tema JSON'u yapıştırın.")
    }
    if (!data || typeof data !== 'object')
      invalidField('theme_json', 'Tema belgesi bir nesne olmalı.')

    const colors = Object.fromEntries([
      ...Object.entries(data.colors ?? {}).map(([key, value]) => [`c_${key}`, value]),
      ...Object.entries(data.lightColors ?? {}).map(([key, value]) => [`cl_${key}`, value]),
    ])
    const lookInput = Object.fromEntries(
      Object.entries(data.looks ?? {}).map(([key, value]) => [`l_${key}`, value])
    )
    const flagInput = Object.fromEntries(
      flags.map((flag) => [`f_${flag.key}`, (data.flags ?? {})[flag.key] === false ? 'off' : 'on'])
    )
    const before = brandKeys().map((key) => settings.get(key))
    await settings.save({
      ...theme.readColors(colors),
      ...theme.readColors(colors, { light: true }),
      ...theme.readLooks(lookInput),
      ...theme.readFlags(flagInput),
      ...theme.readCss(data.css),
    })
    await removeReplacedBranding(before)
    session.flash('success', 'Tema içe aktarıldı')
    return response.redirect('/admin/tema/gelismis')
  }

  /** Drops every colour, look, switch and custom CSS value; site name and announcement stay. */
  async reset({ session, response }: HttpContext) {
    const entries: Record<string, string> = { [CUSTOM_CSS_KEY]: '' }
    for (const token of colorTokens) {
      entries[colorKey(token.key)] = ''
      entries[lightColorKey(token.key)] = ''
    }
    for (const look of looks) entries[lookKey(look.key)] = ''
    for (const flag of flags) entries[flagKey(flag.key)] = ''
    const before = brandKeys().map((key) => settings.get(key))
    await settings.save(entries)
    await removeReplacedBranding(before)
    session.flash('success', 'Tema varsayılan değerlere döndürüldü')
    return response.redirect('/admin/tema/gelismis')
  }
}
