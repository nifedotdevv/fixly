// Booking money is stored in minor units (kobo for NGN); starting_price is whole naira.
export function nairaToKobo(naira) {
  const n = Number(naira)
  if (naira === '' || naira === null || !Number.isFinite(n) || n < 0) {
    throw new RangeError('Enter a naira amount of zero or more')
  }
  const kobo = Math.round(n * 100)
  if (!Number.isSafeInteger(kobo)) throw new RangeError('That amount is too large')
  return kobo
}

export function koboToNaira(kobo) {
  return kobo / 100
}

export function formatMoney({ amount, currency = 'NGN' }) {
  const formatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency })
  const digits = formatter.resolvedOptions().maximumFractionDigits
  return formatter.format(amount / 10 ** digits)
}

export function formatNaira(naira) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(naira)
}
