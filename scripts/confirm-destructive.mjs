/**
 * Guard in front of commands that delete data (`npm run migrate:fresh`, `npm run db:reset`;
 * AGENTS.md rule 7). Asks to type the database name; without a terminal it refuses unless
 * CONFIRM_DESTRUCTIVE=1 is set. Exits 1 when not confirmed, so the next command never runs.
 */
import { createInterface } from 'node:readline/promises'

const what = process.argv.slice(2).join(' ') || 'Bu komut'
if (process.env.CONFIRM_DESTRUCTIVE === '1') process.exit(0)
if (!process.stdin.isTTY) {
  console.error(
    `[onay] ${what} bütün verileri siler. Terminal yok; bilerek çalıştırmak için CONFIRM_DESTRUCTIVE=1 verin.`
  )
  process.exit(1)
}
console.warn(`[onay] ${what} veritabanındaki BÜTÜN verileri siler ve geri alınamaz.`)
console.warn('[onay] Önce yedek alın: npm run db:backup')
const prompt = createInterface({ input: process.stdin, output: process.stdout })
const answer = await prompt.question('Devam etmek için SIL yazın: ')
prompt.close()
if (answer.trim() !== 'SIL') {
  console.error('[onay] İptal edildi.')
  process.exit(1)
}
