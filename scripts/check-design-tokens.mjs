/**
 * Design-system lint for templates and browser components. Colours, radii and shared patterns
 * must come from the design system (resources/css/tokens.css, components.css), so every page
 * follows both colour schemes and Admin → Tema.
 *
 *   npm run lint:design                      # every view and component
 *   npm run lint:design -- path/a.edge ...   # only these files
 *   npm run lint:design -- --summary         # counts per file
 *
 * A line can opt out with the comment `design-ok` (Edge: {{-- design-ok: reason --}}) when a
 * fixed colour is content, e.g. text over a cover image.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const args = process.argv.slice(2)
const summary = args.includes('--summary')
const explicit = args.filter((arg) => !arg.startsWith('--'))

const palette =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone'
const utility =
  'text|bg|border|border-[xytrbl]|ring|ring-offset|from|via|to|fill|stroke|outline|divide|placeholder|accent|caret|shadow|decoration'

const rules = [
  {
    name: 'palet rengi',
    hint: 'Tailwind palet renkleri yerine anlamsal sınıflar: text-ink/body/muted, bg-surface, border-line, text-accent-text, text-danger …',
    pattern: new RegExp(`(?<![\\w-])(?:[a-z-]+:)*(?:${utility})-(?:${palette})-\\d{2,3}\\b`, 'g'),
  },
  {
    name: 'white sınıfı',
    hint: 'white eski katman rengine eşlenir (açık şemada siyah olur): görsel üstü yazı için text-on-image, çizgi için border-line, yüzey için bg-surface/bg-hover.',
    pattern: new RegExp(`(?<![\\w-])(?:[a-z-]+:)*(?:${utility})-white\\b`, 'g'),
  },
  {
    name: 'sabit renk',
    hint: 'Köşeli parantezli renk yerine token: bg-(--t-surface) veya bg-surface.',
    pattern: /-\[(?:#|rgb|hsl|oklch)[^\]]*\]/g,
  },
  {
    name: 'köşesiz rounded',
    hint: 'Ölçekli yarıçap kullanın (rounded-md/lg/xl/2xl/full); bare "rounded" tema çarpanını atlar.',
    pattern: /(?<=["'\s])rounded(?=["'\s])/g,
  },
  {
    name: 'satır içi olay',
    hint: 'onerror/onsubmit/onclick yerine data-fallback, data-confirm veya Alpine bileşeni (AGENTS kural 9).',
    pattern: /\son(?:error|submit|click|load|change)=/g,
  },
  {
    name: 'eski sınıf',
    hint: 'glass, btn-soft, btn-green, section-title yerine panel, btn btn--secondary/primary, t-overline.',
    pattern: /(?<=["'\s])(?:glass|glass-strong|btn-soft|btn-green|section-title)(?=["'\s])/g,
  },
]

function walk(directory, extensions, found = []) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) walk(path, extensions, found)
    else if (extensions.some((ext) => name.endsWith(ext))) found.push(path)
  }
  return found
}

const files = explicit.length
  ? explicit.map((file) => join(process.cwd(), file))
  : [
      ...walk(join(root, 'resources/views'), ['.edge']),
      ...walk(join(root, 'resources/js'), ['.js']),
    ]

let total = 0
const counts = []
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  let count = 0
  lines.forEach((line, index) => {
    if (line.includes('design-ok')) return
    // Browser scripts: only look inside string literals (class names).
    const text = file.endsWith('.js') ? (line.match(/(['"`])(?:(?!\1).)*\1/g) || []).join(' ') : line
    for (const rule of rules) {
      for (const match of text.matchAll(rule.pattern)) {
        count++
        if (!summary)
          console.log(`${relative(root, file)}:${index + 1}  [${rule.name}] ${match[0].trim()}  — ${rule.hint}`)
      }
    }
  })
  if (count) counts.push([relative(root, file), count])
  total += count
}

if (summary) for (const [file, count] of counts.sort((a, b) => b[1] - a[1])) console.log(`${String(count).padStart(5)}  ${file}`)
console.log(`\n${total} tasarım kuralı ihlali, ${counts.length} dosyada (${files.length} dosya tarandı).`)
process.exit(total ? 1 : 0)
