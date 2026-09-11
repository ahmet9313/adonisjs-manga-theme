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
