/**
 * Makes an existing, self-registered account an administrator:
 *
 *   npm run admin:promote -- <kullanıcı adı veya e-posta>
 *
 * Production installs use this for their first admin instead of the demo seeder, so no password
 * ever passes through the command line. Uses the same .env database as the app. (Kept outside
 * `ace` because file-based ace commands fail to load with jsonschema 1.5.0 on Node 24.21+.)
 */
import '@poppinss/ts-exec'
import 'reflect-metadata'
import { Ignitor } from '@adonisjs/core'

const login = (process.argv[2] || '').trim()
if (!login) {
  console.error('Kullanım: npm run admin:promote -- <kullanıcı adı veya e-posta>')
  process.exit(1)
}

const APP_ROOT = new URL('../', import.meta.url)
const importer = (filePath) =>
  filePath.startsWith('./') || filePath.startsWith('../')
    ? import(new URL(filePath, APP_ROOT).href)
    : import(filePath)

const app = new Ignitor(APP_ROOT, { importer }).createApp('console')
app.booting(async () => {
  await import('#start/env')
})
await app.init()
await app.boot()

try {
  const { default: User } = await import('#models/user')
  const user = await User.query()
    .where('username', login)
    .orWhere('email', login.toLowerCase())
    .first()
  if (!user) {
    console.error(`"${login}" adlı bir hesap bulunamadı. Önce siteden kayıt olun.`)
    process.exitCode = 1
  } else if (user.role === 'admin' && !user.bannedAt) {
    console.log(`${user.username} zaten yönetici.`)
  } else {
    user.role = 'admin'
    user.bannedAt = null
    await user.save()
    console.log(`${user.username} artık yönetici.`)
  }
} finally {
  await app.terminate()
}
