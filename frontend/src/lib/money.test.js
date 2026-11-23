import { formatMoney, formatNaira, koboToNaira, nairaToKobo } from './money'

describe('money', () => {
  it('converts naira to kobo', () => {
    expect(nairaToKobo(2500)).toBe(250000)
    expect(nairaToKobo(0.04)).toBe(4)
    expect(nairaToKobo('19.99')).toBe(1999)
    expect(koboToNaira(250000)).toBe(2500)
  })
  it('rejects bad input', () => {
    for (const bad of [-1, NaN, Infinity, '', null, 'abc', Number.MAX_SAFE_INTEGER]) {
      expect(() => nairaToKobo(bad)).toThrow(RangeError)
    }
  })
  it('formats minor units with the currency symbol', () => {
    expect(formatMoney({ amount: 250000 })).toBe('₦2,500.00')
    expect(formatMoney({ amount: 4, currency: 'NGN' })).toBe('₦0.04')
    expect(formatMoney({ amount: 1500, currency: 'JPY' })).toMatch(/1,500/)
  })
  it('formats whole naira', () => {
    expect(formatNaira(5000)).toBe('₦5,000')
  })
})
