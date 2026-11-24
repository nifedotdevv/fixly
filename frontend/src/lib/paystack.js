// Opens Paystack's checkout for a transaction our server already started, and returns a function that closes it.
// The script is loaded only when a homeowner presses Pay, so it is never part of the main bundle.
// The popup is not trusted: whatever it reports, the server asks Paystack before anything is recorded.
export async function openCheckout(accessCode, { onLoad, onSuccess, onCancel, onError }) {
  const { default: PaystackPop } = await import('@paystack/inline-js')
  const popup = new PaystackPop()
  const transaction = popup.resumeTransaction(accessCode, { onLoad, onSuccess, onCancel, onError })
  return () => {
    try { popup.cancelTransaction(transaction) } catch { /* already closed */ }
  }
}
