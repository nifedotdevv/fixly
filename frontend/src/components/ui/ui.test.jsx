import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog, MoneyInput, DateTimeInput, ChipsInput, Button } from './index.js'

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
