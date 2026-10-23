/**
 * A small, safe Markdown subset for static pages and announcements (Admin → İçerik). Raw HTML is
 * never passed through: the text is HTML-escaped first and only the markup below is produced.
 *
 * Blocks: `#`, `##`, `###` headings (rendered as h2–h4; the page title is the h1), paragraphs
 * (a single line break becomes <br>), `-`/`*` and `1.` lists, `>` quotes and `---` rules.
 * Inline: `**kalın**`, `*italik*` / `_italik_`, `` `kod` ``, `[metin](adres)` and bare http(s)
 * addresses. Links accept http(s) addresses, site paths (`/sayfa/sss`) and `#bölüm` only; any
 * other link stays as plain text.
 */

const escapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => escapes[char])

/**
 * Allowed link targets, checked on the escaped text. `/` must not be followed by another slash or
 * a backslash (browsers read `//host` and `/\host` as another site).
 */
const safeHref = /^(?:https?:\/\/[^\s]+|\/(?![/\\])[^\s]*|#[^\s]*)$/i
/** Bare addresses end before whitespace and escaped quotes or angle brackets. */
const bareUrl = /https?:\/\/(?:(?!&(?:lt|gt|quot|#39);)[^\s])+/gi
const trailingPunctuation = /[.,;:!?)\]]+$/
/** Private-use characters mark stored fragments (code, links) while the rest is formatted. */
const marker = (index: number) => `\uE000${index}\uE001`
const markerPattern = /\uE000(\d+)\uE001/g
const hasMarker = /\uE000\d+\uE001/

function link(href: string, label: string) {
  const external = /^https?:/i.test(href)
  const rel = external ? ' rel="noopener noreferrer nofollow"' : ''
  return `<a href="${href}"${rel}>${label}</a>`
}

/** Bold, italic and line breaks on text that is already escaped and free of markers. */
function emphasis(text: string) {
  return text
    .replace(/\*\*(?=\S)([^*]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>')
}

/** One block of inline text (raw input) → safe HTML. */
export function renderInline(raw: string) {
  const stored: string[] = []
  const keep = (html: string) => marker(stored.push(html) - 1)

  let text = escapeHtml(raw.replace(/[\uE000\uE001]/g, ''))
  text = text.replace(/`([^`\n]+)`/g, (_, code: string) => keep(`<code>${code}</code>`))
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) =>
    safeHref.test(href) ? keep(link(href, emphasis(label))) : whole
  )
  text = text.replace(bareUrl, (found: string) => {
    const tail = found.match(trailingPunctuation)?.[0] ?? ''
    const href = tail ? found.slice(0, -tail.length) : found
    return keep(link(href, href)) + tail
  })
  text = emphasis(text).replace(/\n/g, '<br>')
  // Restored fragments may contain earlier markers (a code span inside a link label).
  for (let pass = 0; pass < 3 && hasMarker.test(text); pass++)
    text = text.replace(markerPattern, (_, index: string) => stored[Number(index)] ?? '')
  return text
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'rule' }
  | { kind: 'paragraph'; lines: string[] }

const headingLine = /^(#{1,3})\s+(.+?)\s*#*\s*$/
const bulletLine = /^\s*[-*+]\s+(.*)$/
const orderedLine = /^\s*\d{1,3}[.)]\s+(.*)$/
const quoteLine = /^\s*>\s?(.*)$/
const ruleLine = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/

function parse(source: string): Block[] {
  const blocks: Block[] = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index++
      continue
    }
    const heading = headingLine.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length + 1, text: heading[2] })
      index++
      continue
    }
    if (ruleLine.test(line)) {
      blocks.push({ kind: 'rule' })
      index++
      continue
    }
    const ordered = orderedLine.test(line)
    if (ordered || bulletLine.test(line)) {
      const pattern = ordered ? orderedLine : bulletLine
      const items: string[] = []
      while (index < lines.length && lines[index].trim()) {
        const item = pattern.exec(lines[index])
        // A plain line under an item continues it (a wrapped list item).
        if (item) items.push(item[1])
        else if (items.length && !headingLine.test(lines[index]))
          items[items.length - 1] += '\n' + lines[index].trim()
        else break
        index++
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }
    if (quoteLine.test(line)) {
      const quoted: string[] = []
      while (index < lines.length && quoteLine.test(lines[index]))
        quoted.push(quoteLine.exec(lines[index++])![1])
      blocks.push({ kind: 'quote', lines: quoted })
      continue
    }
    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !headingLine.test(lines[index]) &&
      !ruleLine.test(lines[index]) &&
      !bulletLine.test(lines[index]) &&
      !orderedLine.test(lines[index]) &&
      !quoteLine.test(lines[index])
    )
      paragraph.push(lines[index++].trim())
    blocks.push({ kind: 'paragraph', lines: paragraph })
  }
  return blocks
}

/** Markdown subset → safe HTML for `{{{ }}}` in a `.md-body` container. */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return ''
  return parse(source)
    .map((block) => {
      switch (block.kind) {
        case 'heading':
          return `<h${block.level}>${renderInline(block.text)}</h${block.level}>`
        case 'rule':
          return '<hr>'
        case 'list': {
          const tag = block.ordered ? 'ol' : 'ul'
          const items = block.items.map((item) => `<li>${renderInline(item)}</li>`).join('')
          return `<${tag}>${items}</${tag}>`
        }
        case 'quote':
          return `<blockquote><p>${renderInline(block.lines.join('\n'))}</p></blockquote>`
        default:
          return `<p>${renderInline(block.lines.join('\n'))}</p>`
      }
    })
    .join('\n')
}

/** Plain text of a Markdown body for lists and descriptions (escaped later by the view). */
export function plainText(source: string | null | undefined, max = 200): string {
  if (!source) return ''
  const text = source
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*(?:#{1,3}|[-*+]|\d{1,3}[.)]|>)\s+/gm, '')
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/(\*\*|`)/g, '')
    .replace(/(^|[^\w])[*_](?=\S)([^*_]*?\S)[*_](?!\w)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…'
}
