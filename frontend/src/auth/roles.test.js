import { describe, expect, it } from 'vitest'
import { safeNext } from './roles'

describe('safeNext', () => {
  it('keeps same-origin paths', () => {
    expect(safeNext('/artisan/jobs?x=1')).toBe('/artisan/jobs?x=1')
  })

  it.each(['//evil.com', '/\\evil.com', '/\tfoo', '/foo\nbar', 'https://evil.com', '', null])(
    'rejects %j',
    (value) => {
      expect(safeNext(value)).toBeNull()
    },
  )

  it('leaves percent-encoded input alone because nothing decodes it', () => {
    expect(safeNext('/%5Cevil.com')).toBe('/%5Cevil.com')
  })
})
