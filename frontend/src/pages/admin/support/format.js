export const PURPOSE = { inspection: 'Inspection fee', repair_deposit: 'Repair deposit', repair_balance: 'Repair balance' }
export const PAGE_SIZE = 20

export const pageOf = (sp) => Math.max(1, Number.parseInt(sp.get('page') ?? '', 10) || 1)

export function excerpt(text, max = 90) {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat
}

export const shortId = (id) => String(id ?? '').slice(-8)

export const TH = 'px-3 py-2 text-left text-caption font-medium text-fg-2'
export const TD = 'px-3 py-3 align-top'
