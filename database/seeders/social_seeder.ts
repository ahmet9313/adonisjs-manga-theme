import { BaseSeeder } from '@adonisjs/lucid/seeders'
import app from '@adonisjs/core/services/app'
import contentConfig from '#config/content'
import { buildCommunity, DEMO_EMAIL_DOMAIN, DEMO_PASSWORD } from '#database/demo/community'

/**
 * Makes the demo site look lived in: ~77 readers with avatars, levels, equipment and cards,
 * thousands of threaded comments with GIFs, stickers and spoilers, ratings and written reviews,
 * saved series and reading history. Also hands every existing account the test equipment (all
 * cosmetics, a large card collection) and lets demo readers answer its comments.
 *
 * Runs after `series_seeder` (files are executed alphabetically) and only once; run
 * `npm run seed:clear` to remove it again.
 */
export default class SocialSeeder extends BaseSeeder {
  async run() {
    if (app.inProduction) throw new Error('Demo topluluk verisi üretimde yüklenemez.')
    const report = await buildCommunity({ contentRoot: contentConfig.root, log: console.log })
    if (!report) return
    if (report.skipped) return
    console.log(
      `✓ ${report.users} hesap, ${report.comments} yorum (${report.replies} yanıt), ` +
        `${report.ratings} puan (${report.reviews} inceleme), ${report.cosmetics} kozmetik, ` +
        `${report.cards} kart, ${report.gifs} GIF`
    )
    console.log(`  Demo hesaplar: *@${DEMO_EMAIL_DOMAIN} — parola: ${DEMO_PASSWORD}`)
  }
}
