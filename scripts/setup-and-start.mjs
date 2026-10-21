import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
// start.sh passes its arguments through and start.ps1 maps its switches to these; a typo
// (e.g. --prod) must not silently start the development server.
const known = new Set(['--check', '--production', '--seed', '--skip-install'])
const unknown = [...args].filter((arg) => !known.has(arg))
if (unknown.length) {
  console.error(
    `[start] HATA: Bilinmeyen seçenek: ${unknown.join(' ')}\n` +
      '[start] Kullanılabilir: --check, --seed, --production, --skip-install ' +
      '(Windows: -Check, -Seed, -Production, -SkipInstall)'
  )
  process.exit(1)
}
const checkOnly = args.has('--check')
const production = args.has('--production')
const seed = args.has('--seed')
const skipInstall = args.has('--skip-install')

function step(message) {
  console.log(`\n[start] ${message}`)
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
    ...options,
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Komut başarısız (${result.status}): ${command} ${commandArgs.join(' ')}`)
  }
}

function runNpm(commandArgs, options = {}) {
  if (process.platform === 'win32') {
    run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm', ...commandArgs], options)
    return
  }
  run('npm', commandArgs, options)
}

function readEnv() {
  const values = new Map()
  const content = readFileSync(resolve(projectRoot, '.env'), 'utf8')

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2')
    values.set(key, value)
  }

  return values
}

function assertPortAvailable(host, port) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `${host}:${port} zaten kullanımda. Açık MangaHub penceresini kapatıp tekrar deneyin.`
          )
        )
        return
      }
      reject(error)
    })
    server.once('listening', () => server.close(resolvePromise))
    server.listen(port, host)
  })
}

async function prepareMysql(env) {
  const database = env.get('DB_DATABASE') || 'manga_theme'
  if (!/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error('DB_DATABASE yalnızca harf, rakam ve alt çizgi içerebilir.')
  }

  step(`MySQL veritabanı kontrol ediliyor: ${database}`)
  const mysql = await import('mysql2/promise')
  const connection = await mysql.createConnection({
    host: env.get('DB_HOST') || '127.0.0.1',
    port: Number(env.get('DB_PORT') || 3306),
    user: env.get('DB_USER') || 'root',
    password: env.get('DB_PASSWORD') || '',
  })
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  )
  await connection.end()
}

async function databaseHasSeries(env, sqlitePath) {
  if ((env.get('DB_CONNECTION') || 'sqlite') === 'sqlite') {
    const { default: Database } = await import('better-sqlite3')
    const database = new Database(sqlitePath, { readonly: true })
    const row = database.prepare('SELECT COUNT(*) AS total FROM series').get()
    database.close()
    return Number(row.total) > 0
  }

  const mysql = await import('mysql2/promise')
  const connection = await mysql.createConnection({
    host: env.get('DB_HOST') || '127.0.0.1',
    port: Number(env.get('DB_PORT') || 3306),
    user: env.get('DB_USER') || 'root',
    password: env.get('DB_PASSWORD') || '',
    database: env.get('DB_DATABASE') || 'manga_theme',
  })
  const [rows] = await connection.query('SELECT COUNT(*) AS total FROM series')
  await connection.end()
  return Number(rows[0].total) > 0
}

async function main() {
  const nodeMajor = Number(process.versions.node.split('.')[0])
  if (nodeMajor < 24) {
    throw new Error(`Node.js 24+ gerekli; bulunan sürüm: ${process.version}`)
  }

  step(`Node.js ${process.version} ve ${process.platform} doğrulandı`)

  if (!skipInstall) {
    step('npm bağımlılıkları doğrulanıyor ve eksikler kuruluyor')
    runNpm(['install', '--prefer-offline', '--no-audit', '--no-fund'])
  } else if (!existsSync(resolve(projectRoot, 'node_modules'))) {
    throw new Error('--skip-install kullanıldı ancak node_modules bulunamadı.')
  }

  const envPath = resolve(projectRoot, '.env')
  if (!existsSync(envPath)) {
    copyFileSync(resolve(projectRoot, '.env.example'), envPath)
    step('.env, .env.example üzerinden oluşturuldu')
  }

  let env = readEnv()
  if (!env.get('APP_KEY')) {
    step('AdonisJS uygulama anahtarı oluşturuluyor')
    run(process.execPath, ['ace.js', 'generate:key'])
    env = readEnv()
  }

  const dbConnection = env.get('DB_CONNECTION') || 'sqlite'
  let sqlitePath
  if (dbConnection === 'sqlite') {
    const configuredPath = env.get('SQLITE_DB_PATH') || 'tmp/manga.sqlite3'
    sqlitePath = isAbsolute(configuredPath) ? configuredPath : resolve(projectRoot, configuredPath)
    mkdirSync(dirname(sqlitePath), { recursive: true })
    step(`SQLite hazır: ${sqlitePath}`)
  } else if (dbConnection === 'mysql') {
    await prepareMysql(env)
  } else {
    throw new Error(`Desteklenmeyen DB_CONNECTION: ${dbConnection}`)
  }

  step('Veritabanı migration işlemleri uygulanıyor')
  run(process.execPath, ['ace.js', 'migration:run', '--force'])

  if (seed && production) {
    // The .env usually says NODE_ENV=development, which would bypass the seeders' production
    // guard and create the demo admin (admin@admin.com / admin) on a public server.
    step(
      'UYARI: Üretim modunda örnek veri ve demo yönetici yüklenmez; --seed yok sayıldı. ' +
        'İlk yönetici için siteden kayıt olup "npm run admin:promote -- <kullanıcı adı>" çalıştırın.'
    )
  } else if (seed) {
    if (await databaseHasSeries(env, sqlitePath)) {
      step('Örnek veriler zaten mevcut; tekrar yükleme atlandı')
    } else {
      step('Örnek manga verileri yükleniyor; bu işlem ilk kez biraz sürebilir')
      run(process.execPath, ['ace.js', 'db:seed'])
    }
  }

  if (checkOnly) {
    step('Kurulum ve kontroller başarıyla tamamlandı')
    return
  }

  const host = env.get('HOST') || 'localhost'
  const port = Number(env.get('PORT') || 3333)
  await assertPortAvailable(host, port)
  const address = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`

  if (production) {
    step('Üretim paketi hazırlanıyor')
    runNpm(['run', 'build'])
    const buildRoot = resolve(projectRoot, 'build')
    step(`Üretim sunucusu başlatılıyor: ${address}`)
    run(process.execPath, ['bin/server.js'], {
      cwd: buildRoot,
      env: {
        ...process.env,
        ...Object.fromEntries(env),
        ...(sqlitePath ? { SQLITE_DB_PATH: sqlitePath } : {}),
        CONTENT_ROOT: resolve(projectRoot, env.get('CONTENT_ROOT') || 'public/content'),
        NODE_ENV: 'production',
      },
    })
  } else {
    step(`Geliştirme sunucusu başlatılıyor: ${address}`)
    runNpm(['run', 'dev'])
  }
}

main().catch((error) => {
  console.error(`\n[start] HATA: ${error.message}`)
  process.exitCode = 1
})
