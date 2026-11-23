import Button from './Button.jsx'

/**
 * Row of filter controls above a list. Children are usually `Field` + `Select` / `Input`.
 * "Clear filters" shows only when `onClear` is given and `canClear` is true.
 */
export default function FilterBar({ label = 'Filters', onClear, canClear = false, children }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-end gap-3 sm:gap-4 [&>*]:w-full [&>*]:min-w-[12rem] sm:[&>*]:w-auto">
      {children}
      {onClear && canClear && <Button variant="tertiary" onClick={onClear}>Clear filters</Button>}
    </div>
  )
}
