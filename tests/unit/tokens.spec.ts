import { test } from '@japa/runner'
import { readFileSync } from 'node:fs'
import { colorTokens, fontStacks, looks, presets } from '#config/theme'

const css = readFileSync(new URL('../../resources/css/tokens.css', import.meta.url), 'utf8')

/** Declarations of the first rule whose selector text equals `selector`. */
function block(selector: string, from = 0) {
  const start = css.indexOf(selector + ' {', from)
  if (start === -1) throw new Error(`${selector} bulunamadı`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close)
  const declarations = new Map<string, string>()
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g))
    declarations.set(match[1], match[2].replace(/\s+/g, ' ').trim())
  return declarations
}

test.group('Design tokens', () => {
  test('tokens.css stock colours match config/theme.ts in both schemes', ({ assert }) => {
    const dark = block(':root')
    const light = block(":root[data-theme='light']")
    const system = block(
      ":root[data-theme='system']",
      css.indexOf('@media (prefers-color-scheme: light)')
    )
    for (const token of colorTokens) {
      assert.equal(dark.get(token.css), token.default, `${token.css} (koyu)`)
      assert.equal(light.get(token.css), token.light, `${token.css} (açık)`)
      assert.equal(system.get(token.css), token.light, `${token.css} (sistem/açık)`)
    }
    // Every colour has a light value, so dark overrides never leak into the light scheme.
    assert.equal(light.size, colorTokens.length)
  })

  test('stock looks and the font stack match tokens.css', ({ assert }) => {
    const dark = block(':root')
    for (const look of looks) {
      if (look.type === 'url' || !look.css || look.key === 'font') continue
      const value = look.type === 'range' ? `${look.default}${look.unit}` : look.default
      assert.equal(dark.get(look.css), value, look.css)
    }
    assert.equal(dark.get('--t-font'), fontStacks.sans)
  })

  test('colour tokens and presets are well formed', ({ assert }) => {
    const hex = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/
    const keys = new Set(colorTokens.map((token) => token.key))
    assert.equal(keys.size, colorTokens.length, 'yinelenen anahtar')
    for (const token of colorTokens) {
      assert.match(token.default, hex, token.key)
      assert.match(token.light, hex, token.key)
      assert.match(token.css, /^--t-[a-z0-9-]+$/, token.key)
    }
    for (const preset of presets)
      for (const [key, value] of Object.entries(preset.colors)) {
        assert.isTrue(keys.has(key), `${preset.key}.${key}`)
        assert.match(value, hex, `${preset.key}.${key}`)
      }
  })
})
