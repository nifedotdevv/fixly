// Mirrors backend/src/services/requests/rules.js splitQuote: 70% deposit rounded up, balance is the rest.
export function splitQuote(total) {
  const depositAmount = Number((BigInt(total) * 70n + 99n) / 100n)
  return { depositAmount, balanceAmount: total - depositAmount }
}
