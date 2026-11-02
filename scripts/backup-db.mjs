/**
 * Consistent copy of the SQLite database while the site may be running:
 *
 *   npm run db:backup                       # tmp/backups/manga-YYYYMMDD-HHMMSS.sqlite3
 *   npm run db:backup -- tmp/before-x.bak   # a path of your own
 *
 * The database runs in WAL mode (config/database.ts), so recent writes can still sit in the
 * `-wal` file and a plain file copy may miss them; SQLite's online backup does not. Reads
 * SQLITE_DB_PATH from the environment or .env (default tmp/manga.sqlite3). MySQL: use mysqldump.
 */
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fromEnvFile(name) {
  const file = resolve(root, '.env')
  if (!existsSync(file)) return undefined
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`))
  return line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') || undefined
}

const connection = process.env.DB_CONNECTION ?? fromEnvFile('DB_CONNECTION') ?? 'sqlite'
if (connection !== 'sqlite') {
  console.error('[backup] Bu betik yalnız SQLite içindir; MySQL için mysqldump kullanın.')
  process.exit(1)
}
const configured = process.env.SQLITE_DB_PATH ?? fromEnvFile('SQLITE_DB_PATH') ?? 'tmp/manga.sqlite3'
const source = isAbsolute(configured) ? configured : resolve(root, configured)
if (!existsSync(source)) {
  console.error(`[backup] Veritabanı bulunamadı: ${source}`)
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
const argument = process.argv[2]
const target = argument
  ? resolve(process.cwd(), argument)
  : resolve(root, 'tmp', 'backups', `manga-${stamp}.sqlite3`)
if (existsSync(target)) {
  console.error(`[backup] Hedef zaten var, üzerine yazılmadı: ${target}`)
  process.exit(1)
}
mkdirSync(dirname(target), { recursive: true })

const db = new Database(source, { readonly: true, fileMustExist: true })
try {
  await db.backup(target)
  const copy = new Database(target, { readonly: true })
  const check = copy.pragma('integrity_check', { simple: true })
  copy.close()
  console.log(`[backup] ${target} (integrity_check=${check})`)
  if (check !== 'ok') process.exitCode = 1
} finally {
  db.close()
}
