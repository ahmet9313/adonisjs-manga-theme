import site from '#config/site'

/** Shared boundary normalization for query strings and database timestamps. */
export function pageNumber(value: unknown): number {
  const number = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 1_000_000) : 1
}

export function pageSize(value: unknown): number {
  const number = Number(value)
  return site.adminPageSizes.includes(number) ? number : 20
}

export function searchText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 200) : ''
}

export function filterValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return [
    ...new Set(
      values
        .filter((item): item is string => typeof item === 'string')
        .map(searchText)
        .filter(Boolean)
    ),
  ].slice(0, 50)
}

export function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
}

export function buildPaginationPages(currentPage: number, totalPages: number): (number | string)[] {
  const pages: (number | string)[] = []
  const current = Math.min(currentPage, totalPages)
  for (let page = 1; page <= totalPages; page++) {
    if (totalPages <= 7 || page === 1 || page === totalPages || Math.abs(page - current) <= 1) {
      pages.push(page)
    } else if (pages.at(-1) !== '...') {
      pages.push('...')
    }
  }
  return pages
}
