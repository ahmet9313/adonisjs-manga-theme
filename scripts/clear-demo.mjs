/**
 * Removes the demo community created by `database/seeders/social_seeder.ts`:
 *
 *   npm run seed:clear
 *
 * Deletes the demo accounts (anything @demo.mangahub.local) with their comments, ratings, reading
 * history and cards, the generated cosmetics and cards, and the files under <content>/seed.
 * Series, chapters and real accounts stay. Kept outside `ace` (see promote-admin.mjs).
 */
import '@poppinss/ts-exec'
import 'reflect-metadata'
import { Ignitor } from '@adonisjs/core'

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
  const { default: contentConfig } = await import('#config/content')
  const { clearCommunity } = await import('#database/demo/community')
  await clearCommunity(contentConfig.root, console.log)
} finally {
  await app.terminate()
}
