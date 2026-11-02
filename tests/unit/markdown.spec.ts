import { test } from '@japa/runner'
import { plainText, renderInline, renderMarkdown } from '#services/markdown_service'

test.group('Markdown subset for pages and announcements', () => {
  test('renders headings, paragraphs, emphasis, lists, quotes and rules', ({ assert }) => {
    const html = renderMarkdown(
      [
        '# Hakkımızda',
        '',
        'Biz **gönüllü** bir *ekibiz* ve _çeviri_ yaparız.',
        'İkinci satır',
        '',
        '## Neler yapıyoruz?',
        '- çeviri',
        '- düzenleme',
        '  devam eden satır',
        '',
        '1. bir',
        '2. iki',
        '',
        '> not',
        '',
        '---',
        '',
        '### Kod',
        'snake_case_name ve `<b>kod</b>`',
      ].join('\n')
    )
    assert.include(html, '<h2>Hakkımızda</h2>')
    assert.include(
      html,
      '<p>Biz <strong>gönüllü</strong> bir <em>ekibiz</em> ve <em>çeviri</em> yaparız.<br>İkinci satır</p>'
    )
    assert.include(html, '<h3>Neler yapıyoruz?</h3>')
    assert.include(html, '<ul><li>çeviri</li><li>düzenleme<br>devam eden satır</li></ul>')
    assert.include(html, '<ol><li>bir</li><li>iki</li></ol>')
    assert.include(html, '<blockquote><p>not</p></blockquote>')
    assert.include(html, '<hr>')
    assert.include(html, '<h4>Kod</h4>')
    // Underscores inside words are not emphasis; code is escaped, not interpreted.
    assert.include(html, 'snake_case_name ve <code>&lt;b&gt;kod&lt;/b&gt;</code>')
    assert.equal(renderMarkdown(''), '')
    assert.equal(renderMarkdown(null), '')
  })

  test('raw HTML is always escaped', ({ assert }) => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n# <svg onload=alert(1)>\n\n- <iframe src="https://x.com"></iframe>'
    )
    assert.notInclude(html, '<script')
    assert.notInclude(html, '<img')
    assert.notInclude(html, '<svg')
    assert.notInclude(html, '<iframe')
    assert.include(html, '&lt;script&gt;alert(1)&lt;/script&gt;')
    assert.include(html, 'onerror=&quot;alert(1)&quot;')
    // Markers used internally cannot be smuggled in.
    assert.equal(renderInline('a0b'), 'a0b')
  })

  test('links accept http(s), site paths and anchors only', ({ assert }) => {
    assert.equal(
      renderInline('[Discord](https://discord.gg/abc?x=1&y=2)'),
      '<a href="https://discord.gg/abc?x=1&amp;y=2" rel="noopener noreferrer nofollow">Discord</a>'
    )
    assert.equal(renderInline('[S.S.S.](/sayfa/sss)'), '<a href="/sayfa/sss">S.S.S.</a>')
    assert.equal(renderInline('[yukarı](#basa-don)'), '<a href="#basa-don">yukarı</a>')
    for (const href of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<b>x</b>',
      'vbscript:msgbox(1)',
      '//evil.example',
      '/\\evil.example',
      'mailto:a@b.c',
    ]) {
      const html = renderInline(`[tıkla](${href})`)
      assert.notInclude(html, '<a ', href)
    }
    // A quote cannot leave the attribute.
    const quoted = renderInline('[x](https://a.com/"onmouseover="alert(1))')
    assert.notMatch(quoted, /href="[^"]*"\s*onmouseover/)
    assert.include(quoted, '&quot;')
    // Emphasis never reaches into a link address.
    assert.equal(renderInline('[a](/x*y*z)'), '<a href="/x*y*z">a</a>')
    // Link labels keep emphasis and code.
    assert.equal(
      renderInline('[**kalın** `k`](/a)'),
      '<a href="/a"><strong>kalın</strong> <code>k</code></a>'
    )
  })

  test('bare addresses become links without trailing punctuation', ({ assert }) => {
    assert.equal(
      renderInline('Sunucu: https://discord.gg/abc.'),
      'Sunucu: <a href="https://discord.gg/abc" rel="noopener noreferrer nofollow">https://discord.gg/abc</a>.'
    )
    assert.equal(
      renderInline('https://a.com/<script>'),
      '<a href="https://a.com/" rel="noopener noreferrer nofollow">https://a.com/</a>&lt;script&gt;'
    )
    assert.notInclude(renderInline('javascript:alert(1)'), '<a')
  })

  test('plain text strips the syntax and shortens on a word boundary', ({ assert }) => {
    assert.equal(
      plainText('# Başlık\n\n**Biz** bir [ekip](/x)iz.\n- madde\n> not'),
      'Başlık Biz bir ekipiz. madde not'
    )
    const long = plainText('kelime '.repeat(100), 50)
    assert.isAtMost(long.length, 51)
    assert.isTrue(long.endsWith('…'))
    assert.equal(plainText(null), '')
  })
})
