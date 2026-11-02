import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'
import { isAbsolute } from 'node:path'

const connection = env.get('DB_CONNECTION') ?? 'sqlite'
const configuredSqlitePath = env.get('SQLITE_DB_PATH') ?? 'tmp/manga.sqlite3'

const dbConfig = defineConfig({
  connection,
  connections: {
    sqlite: {
      client: 'better-sqlite3',
      schemaGeneration: { enabled: false },
      connection: {
        filename:
          configuredSqlitePath === ':memory:' || isAbsolute(configuredSqlitePath)
            ? configuredSqlitePath
            : app.makePath(configuredSqlitePath),
      },
      useNullAsDefault: true,
      /**
       * WAL lets pages be read while a member's visit is being written (reads, EXP, last seen)
       * and needs far fewer disk syncs; NORMAL sync is safe with WAL. Writers wait up to 5 s
       * for each other instead of failing. Copy the database with `npm run db:backup` (a plain
       * file copy can miss the `-wal` file while the server runs).
       */
      pool: {
        afterCreate: (handle: any, done: (error: Error | null, handle: any) => void) => {
          try {
            handle.pragma('journal_mode = WAL')
            handle.pragma('synchronous = NORMAL')
            handle.pragma('busy_timeout = 5000')
            handle.pragma('temp_store = MEMORY')
            handle.pragma('foreign_keys = ON')
            done(null, handle)
          } catch (error) {
            done(error as Error, handle)
          }
        },
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },
    mysql: {
      client: 'mysql2',
      schemaGeneration: { enabled: false },
      connection: {
        host: env.get('DB_HOST') ?? '127.0.0.1',
        port: env.get('DB_PORT') ?? 3306,
        user: env.get('DB_USER') ?? 'root',
        password: env.get('DB_PASSWORD') ?? '',
        database: env.get('DB_DATABASE') ?? 'manga_theme',
        // Dates come back as the same "YYYY-MM-DD HH:mm:ss" UTC strings SQLite gives (the code
        // parses those), and Turkish/Japanese/Korean text and emoji fit.
        dateStrings: true,
        timezone: 'Z',
        charset: 'utf8mb4',
      },
      pool: {
        min: 0,
        max: 10,
        idleTimeoutMillis: 5000,
        acquireTimeoutMillis: 60000,
        reapIntervalMillis: 1000,
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },
  },
})

export default dbConfig
