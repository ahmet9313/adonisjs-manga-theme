import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import {
  colorGroups,
  colorTokens,
  flagGroups,
  flags,
  fontStacks,
  looks,
  presets,
} from '#config/theme'
import settings from '#services/settings_service'
import theme, { colorKey, flagKey, lookKey, CUSTOM_CSS_KEY } from '#services/theme_service'
import { invalidField } from '#services/upload_service'

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
  })
)
const duyuruValidator = vine.compile(
  vine.object({
    announcement_enabled: vine.enum(['on']).optional(),
    announcement_text: vine.string().trim().maxLength(160).optional(),
    announcement_url: link,
  })
)

const titles = {
  genel: 'Tema: Genel',
  renkler: 'Tema: Renkler',
  gorunum: 'Tema: Düzen ve Görünüm',
  goster: 'Tema: Göster / Gizle',
  duyuru: 'Tema: Duyuru Çubuğu',
  gelismis: 'Tema: Gelişmiş',
} as const
type Section = keyof typeof titles
const isSection = (value: string): value is Section => value in titles

/** Effective colours/looks (stored or stock) the editors start from. */
const currentColors = () =>
  Object.fromEntries(colorTokens.map((t) => [t.key, settings.get(colorKey(t.key)) || t.default]))
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
          'announcement_enabled',
          'announcement_text',
          'announcement_url',
        ].map((key) => [key, settings.get(key)])
      )
    } else if (section === 'renkler') {
      data.config = {
        mode: 'colors',
        groups: colorGroups,
        tokens: colorTokens,
        values: currentColors(),
        presets,
        looks: looks.filter((look) => look.key === 'scheme'),
        lookValues: currentLooks(),
        stacks: fontStacks,
      }
    } else if (section === 'gorunum') {
      data.config = {
        mode: 'looks',
        looks: looks.filter((look) => look.key !== 'scheme'),
        lookValues: currentLooks(),
        stacks: fontStacks,
      }
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

    if (section === 'genel') {
      const data = await request.validateUsing(genelValidator)
      entries = {
        site_name: data.site_name,
        site_description: data.site_description ?? '',
        logo_url: data.logo_url ?? '',
      }
    } else if (section === 'duyuru') {
      const data = await request.validateUsing(duyuruValidator)
      entries = {
        announcement_enabled: data.announcement_enabled ? '1' : '',
        announcement_text: data.announcement_text ?? '',
        announcement_url: data.announcement_url ?? '',
      }
    } else if (section === 'renkler') {
      entries = { ...theme.readColors(body), ...theme.readLooks(body, ['scheme']) }
    } else if (section === 'gorunum') {
      entries = theme.readLooks(
        body,
        looks.map((l) => l.key).filter((key) => key !== 'scheme')
      )
    } else if (section === 'goster') {
      entries = theme.readFlags(body)
    } else {
      entries = theme.readCss(body.custom_css)
    }

    await settings.save(entries)
    session.flash('success', 'Tema ayarları kaydedildi')
    return response.redirect(`/admin/tema/${section}`)
  }

  /** Every customised theme value as a portable document. */
  private snapshot() {
    return {
      colors: Object.fromEntries(
        colorTokens.map((t) => [t.key, settings.get(colorKey(t.key)) || t.default])
      ),
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

    const colors = Object.fromEntries(
      Object.entries(data.colors ?? {}).map(([key, value]) => [`c_${key}`, value])
    )
    const lookInput = Object.fromEntries(
      Object.entries(data.looks ?? {}).map(([key, value]) => [`l_${key}`, value])
    )
    const flagInput = Object.fromEntries(
      flags.map((flag) => [`f_${flag.key}`, (data.flags ?? {})[flag.key] === false ? 'off' : 'on'])
    )
    await settings.save({
      ...theme.readColors(colors),
      ...theme.readLooks(lookInput),
      ...theme.readFlags(flagInput),
      ...theme.readCss(data.css),
    })
    session.flash('success', 'Tema içe aktarıldı')
    return response.redirect('/admin/tema/gelismis')
  }

  /** Drops every colour, look, switch and custom CSS value; site name and announcement stay. */
  async reset({ session, response }: HttpContext) {
    const entries: Record<string, string> = { [CUSTOM_CSS_KEY]: '' }
    for (const token of colorTokens) entries[colorKey(token.key)] = ''
    for (const look of looks) entries[lookKey(look.key)] = ''
    for (const flag of flags) entries[flagKey(flag.key)] = ''
    await settings.save(entries)
    session.flash('success', 'Tema varsayılan değerlere döndürüldü')
    return response.redirect('/admin/tema/gelismis')
  }
}
