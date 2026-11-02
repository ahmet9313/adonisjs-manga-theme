import db from '@adonisjs/lucid/services/db'
import Post from '#models/post'
import type User from '#models/user'
import access from '#services/access_service'
import { now, slugify } from '#services/input_service'
import { plainText, renderMarkdown } from '#services/markdown_service'

/**
 * A free address for a page or announcement: the given slug (or the title's), with `-2`, `-3` …
 * appended while another row of the table uses it. Empty when the text has no letters or digits.
 */
export async function uniqueSlug(
  table: 'pages' | 'posts',
  text: string,
  exceptId: number | null = null
) {
  const base = slugify(text).slice(0, 120).replace(/-$/, '')
  if (!base) return ''
  const rows = await db
    .from(table)
    .where((query) => query.where('slug', base).orWhere('slug', 'like', `${base}-%`))
    .if(exceptId, (query) => query.whereNot('id', exceptId!))
    .select('slug')
  const taken = new Set(rows.map((row) => String(row.slug)))
  if (!taken.has(base)) return base
  let suffix = 2
  while (taken.has(`${base}-${suffix}`)) suffix++
  return `${base}-${suffix}`
}

/** What lists and the home block show of an announcement. */
export function postSummary(post: Post) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    pinned: post.pinned,
    publishedAt: post.publishedAt,
    excerpt: plainText(post.body, 180),
  }
}

/**
 * Announcements ("Duyurular"). Visitors see published ones (`published_at` set and not in the
 * future); pinned ones come first, then the newest. Drafts are visible to staff only, on their
 * own page with a notice; they never reach lists or the home block.
 */
class PostService {
  private published() {
    return Post.query().whereNotNull('publishedAt').where('publishedAt', '<=', now())
  }

  async list(page: number, perPage = 10) {
    return this.published()
      .orderBy('pinned', 'desc')
      .orderBy('publishedAt', 'desc')
      .orderBy('id', 'desc')
      .paginate(page, perPage)
  }

  /** Newest announcements for the home page block, pinned first. */
  async latest(limit = 3) {
    const posts = await this.published()
      .orderBy('pinned', 'desc')
      .orderBy('publishedAt', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
    return posts.map(postSummary)
  }

  /** One announcement as the visitor may see it, or null (answer 404). */
  async find(slug: string, user: User | null | undefined) {
    const post = await Post.query().where('slug', slug).preload('author').first()
    if (!post) return null
    const live = post.publishedAt !== null && post.publishedAt <= now()
    if (!live && !access.canSeeDrafts(user)) return null
    return { post, live, html: renderMarkdown(post.body) }
  }
}

export default new PostService()
