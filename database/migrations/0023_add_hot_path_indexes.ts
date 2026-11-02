import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Indexes for the hottest reads and for cascading deletes. Additive only.
 *
 * - `chapter_reads(series_id, user_id)`, `bookmarks(series_id)`: "Popüler" counts readers and
 *   savers per series on every home page (22 ms → 0.3 ms on 10 000 reads).
 * - `chapter_reads(read_at)`: "Ayın okurları" (last 30 days).
 * - `comments(created_at, id)`: "Son yorumlar" on the home page.
 * - The rest cover foreign keys SQLite does not index by itself, so deleting a series, chapter,
 *   comment, review, card, cosmetic, user or person no longer scans the child table once per row
 *   (deleting the most commented series: 150 ms → 10 ms). MySQL indexes foreign keys already and
 *   drops its implicit index when one of these covers it.
 */
const indexes: [string, string[], string][] = [
  ['chapter_reads', ['series_id', 'user_id'], 'chapter_reads_series_user_idx'],
  ['chapter_reads', ['chapter_id'], 'chapter_reads_chapter_idx'],
  ['chapter_reads', ['read_at'], 'chapter_reads_read_at_idx'],
  ['bookmarks', ['series_id'], 'bookmarks_series_idx'],
  ['comments', ['created_at', 'id'], 'comments_created_idx'],
  ['comments', ['chapter_id'], 'comments_chapter_idx'],
  ['comments', ['sticker_id'], 'comments_sticker_idx'],
  ['comment_likes', ['comment_id'], 'comment_likes_comment_idx'],
  ['review_votes', ['review_id'], 'review_votes_review_idx'],
  ['user_cards', ['card_id'], 'user_cards_card_idx'],
  ['user_cosmetics', ['cosmetic_id'], 'user_cosmetics_cosmetic_idx'],
  ['profile_likes', ['member_id'], 'profile_likes_member_idx'],
  ['series_authors', ['author_id'], 'series_authors_author_idx'],
  ['series_artists', ['artist_id'], 'series_artists_artist_idx'],
  ['remember_me_tokens', ['tokenable_id'], 'remember_me_tokens_tokenable_idx'],
]

export default class extends BaseSchema {
  async up() {
    for (const [table, columns, name] of indexes)
      this.schema.alterTable(table, (builder) => {
        builder.index(columns, name)
      })
    // Fresh statistics so SQLite's planner picks the new indexes (never ran before).
    this.defer(async (db) => {
      if (db.dialect.name.includes('sqlite')) await db.rawQuery('ANALYZE')
    })
  }

  async down() {
    for (const [table, columns, name] of indexes)
      this.schema.alterTable(table, (builder) => {
        builder.dropIndex(columns, name)
      })
  }
}
