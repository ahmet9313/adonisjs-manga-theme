import { test } from '@japa/runner'
import {
  pageNumber,
  pageSize,
  filterValues,
  slugify,
  buildPaginationPages,
} from '#services/input_service'
import { parsePageOrder } from '#services/upload_service'

test('query parameters tolerate malformed input and bound resource use', ({ assert }) => {
  for (const value of [-2, 0, 'NaN', '1.5', {}, ['2'], Infinity]) assert.equal(pageNumber(value), 1)
  assert.equal(pageNumber('2'), 2)
  assert.equal(pageSize(5000), 20)
  assert.deepEqual(filterValues(['Aksiyon', {}, 'Aksiyon']), ['Aksiyon'])
  assert.deepEqual(filterValues({ bad: 'value' }), [])
  assert.equal(slugify('Çılgın Şövalye: İkinci Çağ!'), 'cilgin-sovalye-ikinci-cag')
  assert.isNotEmpty(slugify('進撃の巨人'))
  assert.deepEqual(buildPaginationPages(5, 10), [1, '...', 4, 5, 6, '...', 10])
})

test('page ordering rejects forged URLs and missing or duplicate files', ({ assert }) => {
  assert.deepEqual(parsePageOrder('["/content/a.png","__new__"]', ['/content/a.png'], 1), [
    '/content/a.png',
    '__new__',
  ])
  assert.deepEqual(parsePageOrder(undefined, ['/content/a.png'], 1), ['/content/a.png', '__new__'])
  for (const raw of [
    '{',
    '{}',
    '["https://example.com/evil.png"]',
    '["__new__"]',
    '["/content/a.png","/content/a.png"]',
  ]) {
    assert.throws(() => parsePageOrder(raw, ['/content/a.png'], 0))
  }
})
