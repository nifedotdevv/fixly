import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import forms from './index.js'
import { splitQuote } from './splitQuote.js'

const mockMutation = (over = {}) => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
  errors: [],
  conflict: false,
  ...over,
})
const local = (hours) => {
  const d = new Date(Date.now() + hours * 3600000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

describe('form map', () => {
  it('has the three artisan actions', () => {
    expect(Object.keys(forms).sort()).toEqual(['accept', 'reject', 'submit-quote'])
  })
})

describe('AcceptForm', () => {
  const Form = forms.accept
  const action = { id: 'accept' }
  it('sends kobo', async () => {
    const mutation = mockMutation()
    render(<Form action={action} mutation={mutation} view={{}} />)
    await userEvent.type(screen.getByLabelText('Inspection fee'), '5,000')
    await userEvent.click(screen.getByRole('button', { name: 'Accept request' }))
    expect(mutation.mutateAsync).toHaveBeenCalledWith({
      action,
      body: { inspectionFee: { amount: 500000, currency: 'NGN' } },
    })
  })
  it('blocks an empty fee', async () => {
    const mutation = mockMutation()
    render(<Form action={action} mutation={mutation} view={{}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Accept request' }))
    expect(mutation.mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByText(/at least ₦0.01/)).toBeInTheDocument()
  })
  it('shows server errors', () => {
    render(<Form action={action} mutation={mockMutation({ errors: ['Window overlaps'] })} view={{}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Window overlaps')
  })
})

describe('splitQuote', () => {
  it('matches the backend rounding', () => {
    expect(splitQuote(10001)).toEqual({ depositAmount: 7001, balanceAmount: 3000 })
    expect(splitQuote(4)).toEqual({ depositAmount: 3, balanceAmount: 1 })
  })
})

describe('QuoteForm', () => {
  const Form = forms['submit-quote']
  const action = { id: 'submit-quote' }
  async function fill({ expiry = 40 } = {}) {
    await userEvent.type(screen.getByLabelText('Scope of work'), 'Replace the cistern')
    await userEvent.type(screen.getByLabelText('Total'), '100')
    fireEvent.change(screen.getByLabelText('Repair starts'), { target: { value: local(48) } })
    fireEvent.change(screen.getByLabelText('Repair ends'), { target: { value: local(52) } })
    fireEvent.change(screen.getByLabelText('Quote valid until'), { target: { value: local(expiry) } })
  }
  it('previews the split', async () => {
    render(<Form action={action} mutation={mockMutation()} view={{}} />)
    await userEvent.type(screen.getByLabelText('Total'), '100')
    expect(screen.getByRole('img')).toHaveAccessibleName(/Deposit ₦70\.00 \(70%\), Balance ₦30\.00 \(30%\)/)
  })
  it('blocks expiry after the repair starts', async () => {
    const mutation = mockMutation()
    render(<Form action={action} mutation={mutation} view={{}} />)
    await fill({ expiry: 50 })
    await userEvent.click(screen.getByRole('button', { name: 'Send quote' }))
    expect(mutation.mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByText(/no later than the repair starts/)).toBeInTheDocument()
  })
  it('sends the right body', async () => {
    const mutation = mockMutation()
    render(<Form action={action} mutation={mutation} view={{}} />)
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Send quote' }))
    const { body } = mutation.mutateAsync.mock.calls[0][0]
    expect(body).toEqual({
      scope: 'Replace the cistern',
      total: { amount: 10000, currency: 'NGN' },
      repairWindow: { start: expect.stringMatching(/[+-]\d\d:\d\d$/), end: expect.stringMatching(/[+-]\d\d:\d\d$/) },
      expiresAt: expect.stringMatching(/[+-]\d\d:\d\d$/),
    })
  })
})

describe('RejectForm', () => {
  const Form = forms.reject
  const action = { id: 'reject' }
  it('requires a reason', async () => {
    const mutation = mockMutation()
    render(<Form action={action} mutation={mutation} view={{}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Decline request' }))
    expect(screen.getByText('Give the homeowner a reason')).toBeInTheDocument()
    expect(screen.getByLabelText('Reason')).toHaveFocus()
    expect(mutation.mutateAsync).not.toHaveBeenCalled()
  })
  it('confirms then sends the reason', async () => {
    const mutation = mockMutation()
    render(<Form action={action} mutation={mutation} view={{}} />)
    await userEvent.type(screen.getByLabelText('Reason'), 'Too far away')
    expect(screen.getByText('12/500 characters')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Decline request' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(dialog.querySelector('button.bg-error, button:last-of-type'))
    expect(mutation.mutateAsync).toHaveBeenCalledWith({ action, body: { reason: 'Too far away' } })
  })
})
