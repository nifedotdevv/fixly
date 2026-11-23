import { useEffect, useState } from 'react'
import { Button, Field, Input, Select } from '../../components/ui/index.js'
import { PROFESSIONS } from './helpers.js'

const TEXT_DELAY = 400
// Each option maps to the backend sortBy and order, kept as separate URL params.
const SORT_OPTIONS = [
  ['createdAt:desc', 'Newest'],
  ['experience_years:desc', 'Most experienced'],
  ['starting_price:asc', 'Lowest starting price'],
  ['starting_price:desc', 'Highest starting price'],
]

// Local text state, committed to the URL on submit or after a pause in typing.
// resetKey changes when the page clears every filter: drop the typed text, which also cancels the pending commit.
function useTextField(urlValue, commit, resetKey) {
  const [value, setValue] = useState(urlValue)
  const [seenReset, setSeenReset] = useState(resetKey)
  if (seenReset !== resetKey) {
    setSeenReset(resetKey)
    setValue('')
  }
  useEffect(() => {
    if (value.trim() === urlValue) return undefined
    const t = setTimeout(() => commit(value.trim()), TEXT_DELAY)
    return () => clearTimeout(t)
  }, [value, urlValue, commit])
  return [value, setValue]
}

export default function Filters({ values, onChange, error, resetKey, onClear }) {
  const set = (key) => (v) => onChange({ [key]: v })
  const [search, setSearch] = useTextField(values.search, set('search'), resetKey)
  const [skill, setSkill] = useTextField(values.skill, set('skill'), resetKey)
  const [area, setArea] = useTextField(values.area, set('area'), resetKey)

  function submit(e) {
    e.preventDefault()
    onChange({ search: search.trim(), skill: skill.trim(), area: area.trim() })
  }

  return (
    <form onSubmit={submit} role="search" aria-label="Filter artisans" className="flex flex-col gap-4">
      {error && <p role="alert" className="text-caption text-error">{error}</p>}
      <Field label="Search">
        <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={200} />
      </Field>
      <Field label="Profession">
        <Select value={values.profession} onChange={(e) => onChange({ profession: e.target.value })}>
          <option value="">All professions</option>
          {PROFESSIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
      </Field>
      <Field label="Skill" helper="Exact skill, e.g. tiling">
        <Input value={skill} onChange={(e) => setSkill(e.target.value)} maxLength={60} />
      </Field>
      <Field label="Area" helper="Exact town or area, e.g. Ikeja">
        <Input value={area} onChange={(e) => setArea(e.target.value)} maxLength={60} />
      </Field>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={values.available}
          onChange={(e) => onChange({ available: e.target.checked ? 'true' : '' })}
          className="size-5 accent-ink"
        />
        Available now only
      </label>
      <Field label="Sort by">
        <Select
          value={`${values.sortBy}:${values.order}`}
          onChange={(e) => {
            const [sortBy, order] = e.target.value.split(':')
            onChange({ sortBy, order })
          }}
        >
          {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      {onClear && <Button type="button" variant="tertiary" onClick={onClear} className="self-start">Clear filters</Button>}
      {/* Enter in a text field submits; this keeps the form valid for assistive tech without a visible button. */}
      <button type="submit" className="sr-only">Apply filters</button>
    </form>
  )
}
