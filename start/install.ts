/*
|--------------------------------------------------------------------------
| First-run setup
|--------------------------------------------------------------------------
|
| Loaded only by the web server (adonisrc.ts → preloads, environment "web"). A database that
| already has an administrator is marked installed; otherwise the console shows where the setup
| wizard is and the key it asks for when opened from another machine (install_service).
|
*/

import app from '@adonisjs/core/services/app'
import env from '#start/env'
import installConfig from '#config/install'

app.ready(async () => {
  const { default: install } = await import('#services/install_service')
  if (await install.adoptExisting()) return
  const host = env.get('HOST', 'localhost')
  const address = `http://${host === '0.0.0.0' ? 'localhost' : host}:${env.get('PORT', 3333)}`
  console.log(
    [
      '',
      '┌─────────────────────────────────────────────────────────────┐',
      '│ Site henüz kurulmadı: kurulum sihirbazını tarayıcıda açın.  │',
      '└─────────────────────────────────────────────────────────────┘',
      `  Adres:            ${address}${installConfig.path}`,
      `  Kurulum anahtarı: ${install.key}  (başka bir bilgisayardan açarken sorulur)`,
      '',
    ].join('\n')
  )
})
