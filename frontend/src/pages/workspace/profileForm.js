export const PROFESSIONS = ['Carpenter', 'Plumber', 'Welder', 'Brick Layer', 'Electrician', 'Auto Mechanic', 'Painter', 'Others']

// Joi messages name the field in a few different ways; order matters (headline before profession).
const FIELDS = [
  ['professional_headline', 'professionalheadline', 'Headline'],
  ['profession', 'profession', 'Profession'],
  ['experience_years', 'experienceyears', 'Years of experience'],
  ['starting_price', 'startingprice', 'Starting price'],
  ['phone_number', 'phonenumber', 'Phone number'],
  ['residential_address', 'residentialaddress', 'Home address'],
  ['office_address', 'officeaddress', 'Work address'],
  ['city', 'city', 'City'],
  ['serviceAreas', 'serviceareas', 'Service areas'],
  ['skills', 'skills', 'Skills'],
]

export const toForm = (p = {}) => ({
  professional_headline: p.professional_headline ?? '',
  profession: p.profession ?? '',
  experience_years: p.experience_years == null ? '' : String(p.experience_years),
  starting_price: p.starting_price == null ? '' : String(p.starting_price),
  city: p.city ?? '',
  serviceAreas: p.serviceAreas ?? [],
  skills: p.skills ?? [],
  phone_number: p.phone_number ?? '',
  residential_address: p.residential_address ?? '',
  office_address: p.office_address ?? '',
})

const NUMERIC = ['experience_years', 'starting_price']
const norm = (k, v) => (NUMERIC.includes(k) ? Number(v) : typeof v === 'string' ? v.trim() : v)
const same = (a, b) => (Array.isArray(a) ? a.join('\n') === b.join('\n') : a === b)

// Only the fields that differ from the baseline; blank optional text is never sent.
export function changedFields(form, base) {
  const out = {}
  for (const k of Object.keys(form)) {
    const next = norm(k, form[k])
    if (same(next, norm(k, base[k]))) continue
    if (k === 'city' && next === '') continue
    out[k] = next
  }
  return out
}

export function createBody(form, isAvailable) {
  const body = {}
  for (const k of Object.keys(form)) body[k] = norm(k, form[k])
  if (body.city === '') delete body.city
  body.isAvailable = isAvailable
  return body
}

const whole = (s) => /^\d+$/.test(s.trim())

export function validate(form) {
  const e = {}
  if (form.professional_headline.trim().length < 3) e.professional_headline = 'Write a headline of at least 3 characters'
  if (!form.profession) e.profession = 'Choose your profession'
  if (!whole(form.experience_years)) e.experience_years = 'Enter whole years, 0 or more'
  if (!whole(form.starting_price)) e.starting_price = 'Enter a whole naira amount'
  if (form.city.trim() && form.city.trim().length < 2) e.city = 'Use at least 2 characters'
  if (form.skills.some((s) => s.length < 2)) e.skills = 'Each skill needs at least 2 characters'
  if (form.serviceAreas.some((s) => s.length < 2)) e.serviceAreas = 'Each area needs at least 2 characters'
  if (form.phone_number.trim().length < 7) e.phone_number = 'Enter a phone number of at least 7 digits'
  if (form.residential_address.trim().length < 3) e.residential_address = 'Enter your home address'
  if (form.office_address.trim().length < 3) e.office_address = 'Enter your work address'
  return e
}

// Maps the backend's string errors to fields. Returns { fields, rest } where rest is anything unmatched.
export function serverErrors(errors) {
  const fields = {}
  const rest = []
  for (const raw of errors ?? []) {
    const text = typeof raw === 'string' ? raw : raw?.message ?? ''
    const flat = text.toLowerCase().replace(/[\s_"]/g, '')
    const hit = FIELDS.find(([, key]) => flat.includes(key))
    if (!hit) { if (text) rest.push(text); continue }
    if (!fields[hit[0]]) fields[hit[0]] = text.replace(/^"[^"]*"/, hit[2]).replace(/^\w+(?= (must|is|length))/, hit[2])
  }
  return { fields, rest }
}
