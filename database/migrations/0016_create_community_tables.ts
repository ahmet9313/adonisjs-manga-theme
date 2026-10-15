import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Earned progression and cosmetics: EXP/levels, daily check-in, notifications, badges,
 * profile likes, collectible cards and comment votes. Only adds tables, columns and the
 * built-in cosmetic catalog; nothing existing is changed or removed.
 */
export default class extends BaseSchema {
  async up() {
    // Plain integer references: SQLite cannot add foreign keys to an existing table in place.
    this.schema.alterTable('users', (table) => {
      table.integer('exp').unsigned().notNullable().defaultTo(0)
      table.integer('streak').unsigned().notNullable().defaultTo(0)
      table.integer('best_streak').unsigned().notNullable().defaultTo(0)
      table.string('last_checkin_on', 10).nullable()
      table.timestamp('last_seen_at').nullable()
      table.integer('frame_id').unsigned().nullable()
      table.integer('effect_id').unsigned().nullable()
      table.integer('wallpaper_id').unsigned().nullable()
      table.integer('profile_like_count').unsigned().notNullable().defaultTo(0)
    })

    this.schema.alterTable('comments', (table) => {
      table.integer('dislike_count').unsigned().notNullable().defaultTo(0)
      table.integer('sticker_id').unsigned().nullable()
    })

    // Existing likes become up-votes (+1); down-votes are stored as -1.
    this.schema.alterTable('comment_likes', (table) => {
      table.integer('value').notNullable().defaultTo(1)
    })

    this.schema.createTable('cosmetics', (table) => {
      table.increments('id')
      table.string('kind', 20).notNullable()
      table.string('name', 60).notNullable()
      table.string('slug', 80).notNullable().unique()
      table.string('image', 255).nullable()
      table.string('style', 120).nullable()
      table.integer('required_level').unsigned().notNullable().defaultTo(1)
      table.string('required_badge', 40).nullable()
      table.boolean('grant_only').notNullable().defaultTo(false)
      table.boolean('featured').notNullable().defaultTo(false)
      table.boolean('active').notNullable().defaultTo(true)
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['kind', 'active'])
    })

    this.schema.createTable('user_cosmetics', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .integer('cosmetic_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('cosmetics')
        .onDelete('CASCADE')
      table.timestamp('created_at').notNullable()
      table.unique(['user_id', 'cosmetic_id'])
    })

    this.schema.createTable('notifications', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('category', 20).notNullable()
      table.string('title', 120).notNullable()
      table.string('body', 500).notNullable().defaultTo('')
      table.string('link', 255).nullable()
      table.timestamp('read_at').nullable()
      table.timestamp('created_at').notNullable()
      table.index(['user_id', 'created_at'])
      table.index(['user_id', 'read_at'])
    })

    this.schema.createTable('user_badges', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('badge', 40).notNullable()
      table.timestamp('earned_at').notNullable()
      table.unique(['user_id', 'badge'])
    })

    this.schema.createTable('profile_likes', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .integer('member_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.timestamp('created_at').notNullable()
      table.unique(['user_id', 'member_id'])
    })

    this.schema.createTable('cards', (table) => {
      table.increments('id')
      table
        .integer('series_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('series')
        .onDelete('SET NULL')
      table.string('name', 80).notNullable()
      table.string('image', 255).notNullable()
      table.string('rarity', 1).notNullable()
      table.boolean('active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['rarity', 'active'])
      table.index(['series_id'])
    })

    this.schema.createTable('user_cards', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .integer('card_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('cards')
        .onDelete('CASCADE')
      table.integer('count').unsigned().notNullable().defaultTo(1)
      table.timestamp('obtained_at').notNullable()
      table.unique(['user_id', 'card_id'])
    })

    this.schema.createTable('user_shards', (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('rarity', 1).notNullable()
      table.integer('amount').unsigned().notNullable().defaultTo(0)
      table.unique(['user_id', 'rarity'])
    })

    // Built-in catalog (frozen copy). Admins can edit, hide or extend it from the panel.
    this.defer(async (db) => {
      const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
      type Row = [
        kind: string,
        slug: string,
        name: string,
        style: string | null,
        level: number,
        extra?: { badge?: string; grant?: boolean; featured?: boolean; image?: string },
      ]
      const rows: Row[] = [
        ['effect', 'efekt-zumrut', 'Zümrüt', 'zumrut', 1, { featured: true }],
        ['effect', 'efekt-okyanus', 'Okyanus', 'okyanus', 3],
        ['effect', 'efekt-gun-batimi', 'Gün Batımı', 'gun-batimi', 5],
        ['effect', 'efekt-sakura', 'Sakura', 'sakura', 7],
        ['effect', 'efekt-siyah-beyaz', 'Siyah Beyaz', 'siyah-beyaz', 9],
        ['effect', 'efekt-altin', 'Altın', 'altin', 12],
        ['effect', 'efekt-buz', 'Buz', 'buz', 15],
        ['effect', 'efekt-neon', 'Neon', 'neon', 18],
        ['effect', 'efekt-ates', 'Şömine', 'ates', 22],
        ['effect', 'efekt-galaksi', 'Galaksi', 'galaksi', 26],
        ['effect', 'efekt-gokkusagi', 'Gökkuşağı', 'gokkusagi', 30],
        ['effect', 'efekt-kraliyet', 'Kraliyet', 'kraliyet', 1, { badge: 'efsane-okur' }],
        ['effect', 'efekt-ekip', 'Ekip', 'ekip', 1, { grant: true }],
        ['frame', 'cerceve-zumrut', 'Zümrüt Halka', 'zumrut', 2, { featured: true }],
        ['frame', 'cerceve-gece', 'Gece', 'gece', 4],
        ['frame', 'cerceve-gumus', 'Gümüş', 'gumus', 6],
        ['frame', 'cerceve-altin', 'Altın', 'altin', 10],
        ['frame', 'cerceve-neon', 'Neon', 'neon', 14],
        ['frame', 'cerceve-buz', 'Buz Kristali', 'buz', 17],
        ['frame', 'cerceve-gokkusagi', 'Gökkuşağı', 'gokkusagi', 20],
        ['frame', 'cerceve-ates', 'Ateş Çemberi', 'ates', 25],
        ['frame', 'cerceve-sadik', 'Sadık Okur', 'sadik', 1, { badge: 'sadik' }],
        ['wallpaper', 'duvar-gece-yarisi', 'Gece Yarısı', 'gece-yarisi', 1],
        ['wallpaper', 'duvar-aurora', 'Aurora', 'aurora', 3, { featured: true }],
        ['wallpaper', 'duvar-gun-batimi', 'Gün Batımı', 'gun-batimi', 6],
        ['wallpaper', 'duvar-sakura', 'Sakura', 'sakura', 9],
        ['wallpaper', 'duvar-derin-okyanus', 'Derin Okyanus', 'derin-okyanus', 12],
        ['wallpaper', 'duvar-nebula', 'Nebula', 'nebula', 16],
        ['wallpaper', 'duvar-dijital', 'Dijital', 'dijital', 20],
        ['wallpaper', 'duvar-lav', 'Lav', 'lav', 24],
        ['wallpaper', 'duvar-altin-saray', 'Altın Saray', 'altin-saray', 1, { badge: 'yorumcu' }],
        [
          'sticker',
          'cikartma-selam',
          'Selam',
          null,
          1,
          { image: '/images/stickers/selam.svg', featured: true },
        ],
        [
          'sticker',
          'cikartma-kahkaha',
          'Kahkaha',
          null,
          1,
          { image: '/images/stickers/kahkaha.svg' },
        ],
        [
          'sticker',
          'cikartma-aglama',
          'Gözyaşı',
          null,
          2,
          { image: '/images/stickers/aglama.svg' },
        ],
        ['sticker', 'cikartma-sok', 'Şok', null, 3, { image: '/images/stickers/sok.svg' }],
        [
          'sticker',
          'cikartma-kalp',
          'Kalp Gözler',
          null,
          4,
          { image: '/images/stickers/kalp.svg' },
        ],
        ['sticker', 'cikartma-bolum', 'Bölüm?', null, 5, { image: '/images/stickers/bolum.svg' }],
        ['sticker', 'cikartma-uyku', 'Uykulu', null, 8, { image: '/images/stickers/uyku.svg' }],
        [
          'sticker',
          'cikartma-kizgin',
          'Kızgın',
          null,
          10,
          { image: '/images/stickers/kizgin.svg' },
        ],
        [
          'sticker',
          'cikartma-havali',
          'Havalı',
          null,
          12,
          { image: '/images/stickers/havali.svg' },
        ],
        [
          'sticker',
          'cikartma-dusunceli',
          'Düşünceli',
          null,
          15,
          { image: '/images/stickers/dusunceli.svg' },
        ],
      ]
      const present = await db.from('cosmetics').select('slug')
      const existing = new Set(present.map((row: { slug: string }) => row.slug))
      const inserts = rows
        .filter(([, slug]) => !existing.has(slug))
        .map(([kind, slug, name, style, level, extra = {}], index) => ({
          kind,
          slug,
          name,
          style,
          image: extra.image ?? null,
          required_level: level,
          required_badge: extra.badge ?? null,
          grant_only: Boolean(extra.grant),
          featured: Boolean(extra.featured),
          active: true,
          sort_order: index,
          created_at: timestamp,
          updated_at: timestamp,
        }))
      if (inserts.length) await db.table('cosmetics').multiInsert(inserts)
    })
  }

  async down() {
    this.schema.dropTable('user_shards')
    this.schema.dropTable('user_cards')
    this.schema.dropTable('cards')
    this.schema.dropTable('profile_likes')
    this.schema.dropTable('user_badges')
    this.schema.dropTable('notifications')
    this.schema.dropTable('user_cosmetics')
    this.schema.dropTable('cosmetics')
    this.schema.alterTable('comment_likes', (table) => table.dropColumn('value'))
    this.schema.alterTable('comments', (table) => table.dropColumns('dislike_count', 'sticker_id'))
    this.schema.alterTable('users', (table) => {
      table.dropColumns(
        'exp',
        'streak',
        'best_streak',
        'last_checkin_on',
        'last_seen_at',
        'frame_id',
        'effect_id',
        'wallpaper_id',
        'profile_like_count'
      )
    })
  }
}
