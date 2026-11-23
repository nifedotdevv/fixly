import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Select from './Select.jsx'
import { Inbox } from 'lucide-react'
import { MemoryRouter, useLocation } from 'react-router'
import { Tabs, FilterBar, ConfirmDialog, MoneyInput, DateTimeInput, ChipsInput, Button, Panel, PageHeader, EmptyState, DataRow, SkeletonRows } from './index.js'

test('ConfirmDialog traps focus, gates confirm on typed text and returns focus to the trigger', async () => {
  const user = userEvent.setup()
  const onConfirm = vi.fn()
  render(
    <>
      <ConfirmDialog
        trigger={<Button>Delete account</Button>}
        title="Delete account"
        description="This permanently deletes ada@example.com."
        confirmLabel="Delete account"
        typeToConfirm="ada@example.com"
        onConfirm={onConfirm}
      />
      <button type="button">Outside</button>
    </>,
  )
  const trigger = screen.getByRole('button', { name: 'Delete account' })
  await user.click(trigger)

  const dialog = await screen.findByRole('alertdialog')
  const confirm = screen.getAllByRole('button', { name: 'Delete account' }).find((b) => dialog.contains(b))
  expect(confirm).toBeDisabled()

  await user.type(screen.getByLabelText(/type/i), 'ada@example.co')
  expect(confirm).toBeDisabled()
  await user.type(screen.getByLabelText(/type/i), 'm')
  expect(confirm).toBeEnabled()

  for (let i = 0; i < 6; i++) {
    await user.tab()
    expect(dialog).toContainElement(document.activeElement)
  }
  expect(screen.getByRole('button', { name: 'Outside', hidden: true })).not.toHaveFocus()

  await user.keyboard('{Escape}')
  await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
})

test('MoneyInput emits integer kobo', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<MoneyInput aria-label="Amount" onChange={onChange} />)
  const input = screen.getByLabelText('Amount')
  expect(input).toHaveAttribute('inputmode', 'numeric')
  await user.type(input, '2500')
  expect(onChange).toHaveBeenLastCalledWith(250000)
  expect(screen.getByText('₦2,500.00')).toBeInTheDocument()
  await user.clear(input)
  expect(onChange).toHaveBeenLastCalledWith(null)
  await user.type(input, 'abc')
  expect(onChange).toHaveBeenLastCalledWith(null)
})

test('DateTimeInput emits an ISO string with seconds and local offset', async () => {
  const onChange = vi.fn()
  const { container } = render(<DateTimeInput onChange={onChange} />)
  const input = container.querySelector('input')
  const { fireEvent } = await import('@testing-library/react')
  fireEvent.change(input, { target: { value: '2027-01-12T09:00' } })
  expect(onChange).toHaveBeenLastCalledWith(expect.stringMatching(/^2027-01-12T09:00:00[+-]\d{2}:\d{2}$/))
  fireEvent.change(input, { target: { value: '' } })
  expect(onChange).toHaveBeenLastCalledWith(null)
  expect(screen.getByText(/Times are in .*UTC[+-]\d{2}:\d{2}/)).toBeInTheDocument()
})

test('ChipsInput lowercases, collapses whitespace, dedupes and removes', async () => {
  const user = userEvent.setup()
  function Harness() {
    const [value, setValue] = useState([])
    return <ChipsInput aria-label="Areas" value={value} onChange={setValue} max={3} />
  }
  render(<Harness />)
  const input = screen.getByLabelText('Areas')
  await user.type(input, '  Lekki   Phase 1{Enter}')
  await user.type(input, 'LEKKI PHASE 1,')
  await user.type(input, 'yaba,')
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['lekki phase 1', 'yaba'])
  await user.click(screen.getByRole('button', { name: 'Remove yaba' }))
  expect(screen.queryByText('yaba')).not.toBeInTheDocument()
})

test('a loading submit button stays focusable but does not activate', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  const onSubmit = vi.fn((e) => e.preventDefault())
  render(
    <form onSubmit={onSubmit}>
      <input aria-label="Name" />
      <Button type="submit" loading onClick={onClick}>Save</Button>
    </form>,
  )
  const button = screen.getByRole('button')
  expect(button).toHaveAttribute('aria-disabled', 'true')
  button.focus()
  expect(button).toHaveFocus()
  await user.keyboard('{Enter}')
  await user.keyboard(' ')
  await user.click(button)
  await user.type(screen.getByLabelText('Name'), 'x{Enter}')
  expect(onClick).not.toHaveBeenCalled()
  expect(onSubmit).not.toHaveBeenCalled()
})

test('MoneyInput accepts a pasted "₦2,500"', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<MoneyInput aria-label="Amount" onChange={onChange} />)
  const input = screen.getByLabelText('Amount')
  await user.click(input)
  await user.paste('₦2,500')
  expect(input).toHaveValue('2500')
  expect(onChange).toHaveBeenLastCalledWith(250000)
  await user.clear(input)
  await user.type(input, '12.5')
  expect(screen.getByText('Enter a whole naira amount')).toBeInTheDocument()
})

test('ChipsInput explains a duplicate instead of dropping it silently', async () => {
  const user = userEvent.setup()
  function Harness() {
    const [value, setValue] = useState([])
    return <ChipsInput aria-label="Areas" value={value} onChange={setValue} />
  }
  render(<Harness />)
  const input = screen.getByLabelText('Areas')
  await user.type(input, 'yaba,')
  await user.type(input, 'Yaba,')
  expect(screen.getAllByText('“yaba” is already added.').length).toBeGreaterThan(0)
  expect(input).toHaveFocus()
})

test('Select is found by label, changes value, and passes props to the native select', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const { container } = render(
    <label>
      Trade
      <Select name="trade" data-testid="sel" aria-describedby="hint" defaultValue="a" onChange={onChange}>
        <option value="a">Plumber</option>
        <option value="b">Electrician</option>
      </Select>
    </label>,
  )
  const select = screen.getByLabelText('Trade')
  expect(select.tagName).toBe('SELECT')
  expect(select).toHaveAttribute('name', 'trade')
  expect(select).toHaveAttribute('aria-describedby', 'hint')
  expect(select).toHaveAttribute('data-testid', 'sel')
  await user.selectOptions(select, 'b')
  expect(select).toHaveValue('b')
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})

test('Panel is a section labelled by its title, shows the action, and flush drops body padding', () => {
  const { rerender } = render(<Panel title="Payments" action={<button type="button">Add</button>}>Body</Panel>)
  const region = screen.getByRole('region', { name: 'Payments' })
  expect(screen.getByRole('heading', { level: 2, name: 'Payments' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  expect(region).toHaveClass('p-5')
  rerender(<Panel title="Payments" flush>Body</Panel>)
  expect(screen.getByRole('region', { name: 'Payments' })).not.toHaveClass('p-5')
})

test('PageHeader renders one h1, a polite summary and actions', () => {
  render(<PageHeader title="Requests" summary="3 open" actions={<button type="button">New</button>} />)
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1, name: 'Requests' })).toBeInTheDocument()
  expect(screen.getByText('3 open')).toHaveAttribute('aria-live', 'polite')
  expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
})

test('EmptyState renders message, action and an aria-hidden icon', () => {
  const { container } = render(<EmptyState icon={Inbox} message="Nothing here." action={<button type="button">Start</button>} />)
  expect(screen.getByText('Nothing here.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})

const TAB_ITEMS = [
  { value: 'needs', label: 'Needs you', count: 1 },
  { value: 'waiting', label: 'Waiting', count: 0 },
  { value: 'finished', label: 'Finished' },
]
const Where = () => <output data-testid="loc">{useLocation().search}</output>
const renderTabs = (props, entry = '/x') => render(
  <MemoryRouter initialEntries={[entry]}>
    <Tabs label="Request groups" items={TAB_ITEMS} {...props}>{(v) => <p>{`Panel ${v}`}</p>}</Tabs>
    <Where />
  </MemoryRouter>,
)

test('Tabs render role=tab with counts and a readable accessible name', () => {
  renderTabs({})
  expect(screen.getAllByRole('tab')).toHaveLength(3)
  expect(screen.getByRole('tab', { name: 'Needs you, 1' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tab', { name: 'Finished' })).toBeInTheDocument()
  expect(screen.getByRole('tablist', { name: 'Request groups' })).toBeInTheDocument()
})

test('clicking a tab selects it and shows its panel', async () => {
  const user = userEvent.setup()
  renderTabs({})
  await user.click(screen.getByRole('tab', { name: 'Finished' }))
  expect(screen.getByRole('tab', { name: 'Finished' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel finished')
})

test('arrow, Home and End keys move focus and selection', async () => {
  const user = userEvent.setup()
  renderTabs({})
  screen.getByRole('tab', { name: 'Needs you, 1' }).focus()
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('tab', { name: /Waiting/ })).toHaveFocus()
  expect(screen.getByRole('tab', { name: /Waiting/ })).toHaveAttribute('aria-selected', 'true')
  await user.keyboard('{End}')
  expect(screen.getByRole('tab', { name: 'Finished' })).toHaveAttribute('aria-selected', 'true')
  await user.keyboard('{Home}')
  expect(screen.getByRole('tab', { name: /Needs you/ })).toHaveFocus()
})

test('Tabs with param read the URL, keep other params and fall back on unknown values', async () => {
  const user = userEvent.setup()
  const { unmount } = renderTabs({ param: 'tab' }, '/x?tab=finished&status=pending')
  expect(screen.getByRole('tab', { name: 'Finished' })).toHaveAttribute('aria-selected', 'true')
  await user.click(screen.getByRole('tab', { name: 'Needs you, 1' }))
  expect(screen.getByTestId('loc')).toHaveTextContent('tab=needs')
  expect(screen.getByTestId('loc')).toHaveTextContent('status=pending')
  unmount()
  renderTabs({ param: 'tab', defaultValue: 'waiting' }, '/x?tab=bogus')
  expect(screen.getByRole('tab', { name: /Waiting/ })).toHaveAttribute('aria-selected', 'true')
})

test('FilterBar is a labelled group and shows Clear filters only when it can clear', async () => {
  const user = userEvent.setup()
  const onClear = vi.fn()
  const { rerender } = render(<FilterBar onClear={onClear}><span>child</span></FilterBar>)
  expect(screen.getByRole('group', { name: 'Filters' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  rerender(<FilterBar onClear={onClear} canClear><span>child</span></FilterBar>)
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(onClear).toHaveBeenCalledTimes(1)
})

describe('DataRow', () => {
  const renderRow = (props) => render(
    <MemoryRouter>
      <ul>
        <DataRow {...props}>
          <DataRow.Cell>Fix tap</DataRow.Cell>
          <DataRow.Cell numeric align="end">120</DataRow.Cell>
        </DataRow>
      </ul>
    </MemoryRouter>,
  )

  test('is one link with the right href containing every cell', () => {
    renderRow({ to: '/requests/1' })
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/requests/1')
    expect(links[0]).toHaveTextContent('Fix tap')
    expect(links[0]).toHaveTextContent('120')
  })

  test('numeric cell is tabular and end aligned', () => {
    renderRow({ to: '/r' })
    const cell = screen.getByText('120')
    expect(cell).toHaveClass('tabular', 'text-right')
  })

  test('selected sets aria-current, and accepts an override', () => {
    const { unmount } = renderRow({ to: '/r', selected: true })
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'true')
    unmount()
    renderRow({ to: '/r', selected: true, 'aria-current': 'page' })
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page')
  })

  test('as="div" renders no link', () => {
    renderRow({ as: 'div' })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  test('compact applies the 40px minimum height', () => {
    renderRow({ to: '/r', compact: true })
    expect(screen.getByRole('link')).toHaveClass('min-h-10')
  })
})

test('SkeletonRows renders count aria-hidden rows', () => {
  const { container } = render(<SkeletonRows count={3} />)
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  expect(container.querySelectorAll('[data-skeleton-row]')).toHaveLength(3)
})
