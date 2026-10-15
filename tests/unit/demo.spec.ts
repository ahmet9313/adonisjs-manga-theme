import { test } from '@japa/runner'
import { gradientPattern } from '#config/cosmetics'
import { excerptOf } from '#services/comment_service'
import { stickerGifs, reactionGifs } from '#database/demo/animations'
import {
  avatarMotifs,
  avatarSvg,
  bannerSvg,
  cardArtSvg,
  frameSvg,
  stickerSvg,
  wallpaperSvg,
  type FrameStyle,
  type WallpaperStyle,
} from '#database/demo/art'
import { buildExtraCosmetics, DEMO_SLUG_PREFIX } from '#database/demo/catalog'
import {
  applyVoice,
  fill,
  writeReview,
  replyTemplates,
  seriesComments,
  chapterComments,
} from '#database/demo/corpus'
import {
  Canvas,
  encodeGif,
  fitText,
  hex,
  palette,
  quantize,
  renderAnimation,
  textWidth,
} from '#database/demo/gif'
import { planPeople } from '#database/demo/people'
import { createRng, hashSeed } from '#database/demo/rng'

/** Independent GIF reader (LZW) so the encoder is checked against something other than itself. */
function decodeGif(buffer: Buffer) {
  let at = 6
  const width = buffer.readUInt16LE(at)
  const height = buffer.readUInt16LE(at + 2)
  const flags = buffer[at + 4]
  at += 7
  if (flags & 0x80) at += 3 * (1 << ((flags & 7) + 1))
  const frames: Uint8Array[] = []
  let loops = false
  while (at < buffer.length) {
    const block = buffer[at++]
    if (block === 0x3b) break
    if (block === 0x21) {
      const label = buffer[at++]
      if (label === 0xff && buffer.subarray(at + 1, at + 12).toString() === 'NETSCAPE2.0')
        loops = true
      while (buffer[at]) at += buffer[at] + 1
      at++
      continue
    }
    if (block !== 0x2c) throw new Error(`unexpected block ${block}`)
    at += 8
    const local = buffer[at++]
    if (local & 0x80) at += 3 * (1 << ((local & 7) + 1))
    const minimum = buffer[at++]
    const data: number[] = []
    while (buffer[at]) {
      for (let index = 0; index < buffer[at]; index++) data.push(buffer[at + 1 + index])
      at += buffer[at] + 1
    }
    at++
    const clear = 1 << minimum
    const end = clear + 1
    let size = minimum + 1
    let table: number[][] = []
    let previous: number[] | null = null
    const output: number[] = []
    const reset = () => {
      table = Array.from({ length: clear }, (_, index) => [index])
      table[clear] = []
      table[end] = []
      size = minimum + 1
      previous = null
    }
    reset()
    let buffered = 0
    let bits = 0
    let cursor = 0
    for (;;) {
      while (bits < size && cursor < data.length) {
        buffered |= data[cursor++] << bits
        bits += 8
      }
      if (bits < size) break
      const code = buffered & ((1 << size) - 1)
      buffered >>>= size
      bits -= size
      if (code === clear) {
        reset()
        continue
      }
      if (code === end) break
      const entry: number[] = table[code] ?? [...previous!, previous![0]]
      output.push(...entry)
      if (previous) table.push([...previous, entry[0]])
      previous = entry
      if (table.length === 1 << size && size < 12) size++
    }
    frames.push(Uint8Array.from(output))
  }
  return { width, height, frames, loops }
}

test('seeded generator is reproducible and well behaved', ({ assert }) => {
  const a = createRng(7)
  const b = createRng(7)
  const first = Array.from({ length: 8 }, () => a.next())
  assert.deepEqual(
    first,
    Array.from({ length: 8 }, () => b.next())
  )
  assert.notDeepEqual(
    first,
    Array.from({ length: 8 }, () => createRng(8).next())
  )
  assert.isTrue(first.every((value) => value >= 0 && value < 1))

  const rng = createRng(1)
  const numbers = Array.from({ length: 200 }, () => rng.int(3, 5))
  assert.isTrue(numbers.every((value) => value >= 3 && value <= 5))
  assert.sameMembers([...new Set(numbers)], [3, 4, 5])
  assert.sameMembers(rng.shuffle([1, 2, 3, 4]), [1, 2, 3, 4])
  assert.lengthOf(rng.sample([1, 2, 3, 4, 5], 3), 3)
  assert.lengthOf(rng.sample([1, 2], 9), 2)
  assert.equal(rng.weighted([['only', 1]]), 'only')
  const tails = Array.from({ length: 500 }, () => rng.longTail(2, 20))
  assert.isTrue(tails.every((value) => value >= 0 && value <= 20))
  assert.isAbove(tails.filter((value) => value <= 2).length, tails.length / 2)
  assert.equal(hashSeed('abc'), hashSeed('abc'))
  assert.notEqual(hashSeed('abc'), hashSeed('abd'))
})

test('GIF encoder output decodes back to the same pixels', ({ assert }) => {
  const width = 17
  const height = 9
  const frames = [0, 1, 2].map((frame) => ({
    indices: Uint8Array.from(
      { length: width * height },
      (_, pixel) => (pixel * 7 + frame * 31) % 256
    ),
    delay: 5,
  }))
  const gif = encodeGif(width, height, frames)
  assert.equal(gif.subarray(0, 6).toString(), 'GIF89a')
  assert.equal(gif[gif.length - 1], 0x3b)
  const decoded = decodeGif(gif)
  assert.equal(decoded.width, width)
  assert.equal(decoded.height, height)
  assert.isTrue(decoded.loops)
  assert.lengthOf(decoded.frames, 3)
  decoded.frames.forEach((pixels, index) =>
    assert.deepEqual([...pixels], [...frames[index].indices])
  )

  // Long runs and noisy data exercise code-size growth and table resets.
  const noisy = Uint8Array.from({ length: 64 * 64 }, (_, pixel) => ((pixel * pixel) >> 3) & 255)
  const flat = new Uint8Array(64 * 64).fill(9)
  for (const indices of [noisy, flat]) {
    const result = decodeGif(encodeGif(64, 64, [{ indices, delay: 2 }]))
    assert.deepEqual([...result.frames[0]], [...indices])
  }
})

test('canvas draws anti-aliased shapes, text and quantises to the palette', ({ assert }) => {
  const canvas = new Canvas(40, 40, 2)
  canvas.clear(hex('#000000'))
  canvas.circle(20, 20, 10, hex('#ff0000'))
  canvas.text('Çİ', 2, 30, 1, hex('#ffffff'))
  const pixels = canvas.render()
  const at = (x: number, y: number) => [
    pixels[(y * 40 + x) * 3],
    pixels[(y * 40 + x) * 3 + 1],
    pixels[(y * 40 + x) * 3 + 2],
  ]
  assert.deepEqual(at(20, 20), [255, 0, 0])
  assert.deepEqual(at(1, 1), [0, 0, 0])
  // Edge pixels are blended, not pure.
  const blended = Array.from({ length: 40 * 40 }, (_, pixel) => pixels[pixel * 3]).filter(
    (value) => value > 0 && value < 255
  )
  assert.isAbove(blended.length, 10)

  const indices = quantize(pixels, 40, 40)
  assert.lengthOf(indices, 1600)
  assert.isTrue(indices.every((index) => index < 256))
  assert.equal(palette.length, 256 * 3)

  assert.equal(textWidth('ABC', 2), (3 * 6 - 1) * 2)
  assert.equal(fitText('A', 100), 3)
  assert.equal(fitText('BÖLÜM YÜKLENİYOR', 148), 1)
})

test('reaction GIFs render as valid, looping animations', async ({ assert }) => {
  assert.isAtLeast(reactionGifs.length, 12)
  assert.isAtLeast(stickerGifs.length, 6)
  assert.lengthOf(new Set(reactionGifs.map((gif) => gif.slug)), reactionGifs.length)
  for (const gif of [reactionGifs[0], stickerGifs[0]]) {
    const bytes = renderAnimation(gif.spec)
    const decoded = decodeGif(bytes)
    assert.equal(decoded.width, gif.spec.width)
    assert.lengthOf(decoded.frames, gif.spec.frames)
    assert.isTrue(decoded.loops)
    assert.isBelow(bytes.length, 150 * 1024)
    // Some frame differs from the first one: it actually animates.
    assert.isTrue(
      decoded.frames.some((frame) =>
        frame.some((value, index) => value !== decoded.frames[0][index])
      )
    )
  }
}).timeout(8000)

test('generated artwork is well-formed SVG and escapes text', ({ assert }) => {
  const frameStyles: FrameStyle[] = [
    'ring',
    'dashed',
    'double',
    'rays',
    'petals',
    'hearts',
    'catears',
    'halo',
    'crown',
    'wings',
    'flames',
    'stars',
    'pixel',
    'laurel',
    'snow',
    'circuit',
  ]
  const wallpaperStyles: WallpaperStyle[] = [
    'stripes',
    'waves',
    'halftone',
    'hex',
    'topo',
    'starfield',
    'mesh',
    'petals',
    'city',
    'mountains',
    'triangles',
    'plaid',
    'circuit',
    'rain',
    'aurora',
    'synth',
    'speed',
    'checker',
    'bubbles',
    'seigaiha',
  ]
  const files = [
    ...avatarMotifs.map((motif) => avatarSvg('seed', motif, 120)),
    bannerSvg('x', 200),
    ...frameStyles.map((style) => frameSvg(style, '#ff0000', '#00ff00')),
    ...wallpaperStyles.map((style) => wallpaperSvg(style, 200, 'seed')),
    cardArtSvg('Ev <script>alert(1)</script> & "Ses"', 'S', 80, 'k'),
    stickerSvg({ type: 'tag', text: '<b>&', fill: '#fff', ink: '#000' }),
  ]
  for (const file of files) {
    assert.match(file, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    assert.match(file, /<\/svg>$/)
    assert.notInclude(file, 'NaN')
    assert.notInclude(file, 'undefined')
  }
  const card = cardArtSvg('Ev <script>alert(1)</script> & "Ses"', 'S', 80, 'k')
  assert.notInclude(card, '<script>')
  assert.include(card, '&lt;script&gt;')
  // Same seed, same picture.
  assert.equal(avatarSvg('a', 'kedi', 10), avatarSvg('a', 'kedi', 10))
  assert.notEqual(wallpaperSvg('starfield', 10, 'a'), wallpaperSvg('starfield', 10, 'b'))
})

test('extra cosmetics are plentiful, unique and use valid styles', ({ assert }) => {
  const items = buildExtraCosmetics()
  const count = (kind: string) => items.filter((item) => item.kind === kind).length
  assert.isAtLeast(count('effect'), 20)
  assert.isAtLeast(count('frame'), 20)
  assert.isAtLeast(count('wallpaper'), 15)
  assert.isAtLeast(count('sticker'), 30)
  assert.lengthOf(new Set(items.map((item) => item.slug)), items.length)
  for (const item of items) {
    assert.isTrue(item.slug.startsWith(DEMO_SLUG_PREFIX))
    assert.isAtMost(item.slug.length, 80)
    assert.isAtMost(item.name.length, 60)
    assert.isAtLeast(item.level, 1)
    if (item.kind === 'effect') assert.match(item.style!, gradientPattern)
    else assert.isDefined(item.file)
  }
  assert.isTrue(items.some((item) => item.grantOnly))
  assert.isTrue(items.some((item) => item.badge))
  assert.isTrue(items.some((item) => item.file?.path.endsWith('.gif')))
}).timeout(8000)

test('Turkish text generators fill templates and vary with the rating', ({ assert }) => {
  assert.equal(fill('{t} ve {o}, {n}. bölüm', { t: 'A', o: 'B', n: 4 }), 'A ve B, 4. bölüm')
  const rng = createRng(3)
  const subject = { title: 'Solo Leveling', other: 'Naruto', genres: ['Aksiyon', 'Fantastik'] }
  const rave = Array.from({ length: 40 }, () => writeReview(10, subject, rng))
  const bad = Array.from({ length: 40 }, () => writeReview(2, subject, rng))
  for (const review of [...rave, ...bad]) {
    assert.isAbove(review.body.length, 30)
    assert.notInclude(review.body, '{')
    if (review.title) assert.isAtMost(review.title.length, 80)
  }
  assert.isTrue(rave.some((review) => /muhteşem|zirve|etkilen|tam puan|okuyun/i.test(review.body)))
  assert.isTrue(
    bad.some((review) =>
      /hayal kırıklığı|olmadı|tatmin etmedi|ilgimi kaybettim|zamanınızı/i.test(review.body)
    )
  )

  for (const voice of ['normal', 'lower', 'emoji', 'stretch', 'formal', 'shout'] as const)
    assert.isNotEmpty(applyVoice('Bu seri çok güzel!', voice, rng))
  assert.equal(applyVoice('Harika!', 'lower', rng), 'harika')
  assert.match(applyVoice('Harika', 'emoji', rng), /\p{Extended_Pictographic}$/u)

  // No template leaves a placeholder behind once filled.
  const all = [
    ...Object.values(seriesComments).flat(),
    ...chapterComments,
    ...Object.values(replyTemplates).flat(),
  ]
  for (const template of all)
    assert.notMatch(fill(template, { t: 'T', o: 'O', n: 1 }), /\{[a-z]+\}/)
})

test('comment excerpts summarise what a reply answers', ({ assert }) => {
  const base = { body: '', image: null, stickerId: null, spoiler: false }
  assert.equal(excerptOf({ ...base, body: '  Çok   güzel\nbir bölüm ' }), 'Çok güzel bir bölüm')
  assert.equal(excerptOf({ ...base, body: 'a'.repeat(300) }, 20), `${'a'.repeat(19)}…`)
  assert.equal(excerptOf({ ...base, body: 'Gizli', spoiler: true }), 'Spoiler içeren yorum')
  assert.equal(excerptOf({ ...base, stickerId: 3 }), 'Bir çıkartma gönderdi')
  assert.equal(excerptOf({ ...base, image: '/content/x/a.gif' }), 'Bir GIF gönderdi')
  assert.equal(excerptOf({ ...base, image: '/content/x/a.png' }), 'Bir görsel gönderdi')
})

test('the cast has every archetype, unique registration-safe usernames and sane stats', ({
  assert,
}) => {
  const now = Date.now()
  for (const scale of [0.1, 1]) {
    const people = planPeople(createRng(11), scale, now)
    assert.lengthOf(new Set(people.map((person) => person.username)), people.length)
    for (const person of people) {
      assert.match(person.username, /^[a-z0-9_]{3,20}$/)
      assert.isAtMost(person.fullName.length, 80)
      assert.isBelow(person.createdAt, now)
      assert.isAtMost(person.lastSeenAt, now)
      assert.isAtLeast(person.lastSeenAt, person.createdAt)
      assert.isAtLeast(person.bestStreak, person.streak)
    }
    assert.sameMembers(
      [...new Set(people.map((person) => person.archetype))],
      ['staff', 'veteran', 'critic', 'regular', 'casual', 'newbie', 'lurker']
    )
    assert.isTrue(
      people
        .filter((person) => person.archetype === 'staff')
        .every((person) => person.role === 'editor')
    )
  }
  assert.isAbove(planPeople(createRng(11), 1, now).length, 60)
})
