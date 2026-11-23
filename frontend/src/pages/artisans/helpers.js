import { formatNaira } from '../../lib/money.js'

export const PROFESSIONS = ['Carpenter', 'Plumber', 'Welder', 'Brick Layer', 'Electrician', 'Auto Mechanic', 'Painter', 'Others']

export const titleCase = (value) => String(value ?? '').replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())

export const profileId = (p) => p.id ?? p._id
export const fullName = (p) => [p.user_id?.firstName, p.user_id?.lastName].filter(Boolean).join(' ')
export const placeLine = (p) => [...new Set([p.city, ...(p.serviceAreas ?? [])].filter(Boolean).map(titleCase))].join(', ')
export const fromPrice = (p) => (p.starting_price == null ? null : `From ${formatNaira(p.starting_price)}`)
