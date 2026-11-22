import { act, render, screen } from '@testing-library/react'
import { Tape, SplitTape } from './index.js'

const label = (c) => c.querySelector('[role="img"]').getAttribute('aria-label')

test('aria-label names the stage and the next one', () => {
  const { container } = render(<Tape status="inspection_completed" view={{}} />)
  expect(label(container)).toBe('Stage 3 of 7: Inspected. Next: Quoted.')
})

test('completed has no next stage', () => {
  const { container } = render(<Tape status="completed" view={{}} />)
  expect(label(container)).toBe('Stage 7 of 7: Settled. Complete.')
})

test('cancelled after a quote ends at Quoted', () => {
  const { container } = render(<Tape status="cancelled" view={{ quote: { total: 1 } }} />)
  expect(label(container)).toBe('Ended at stage 4 of 7: Quoted. Cancelled.')
})

test('ended statuses render the ended marker, others do not', () => {
  const { rerender } = render(<Tape status="rejected" view={{}} />)
  expect(screen.getByTestId('tape-ended')).toBeInTheDocument()
  rerender(<Tape status="pending" view={{}} />)
  expect(screen.queryByTestId('tape-ended')).not.toBeInTheDocument()
})

test('problem_reported renders the error marker', () => {
  render(<Tape status="problem_reported" view={{}} />)
  expect(screen.getByTestId('tape-problem')).toBeInTheDocument()
})

test('deadline label and notch render', () => {
  const deadline = new Date(Date.now() + 22 * 60000).toISOString()
  const { container } = render(<Tape status="quote_submitted" view={{}} deadline={deadline} />)
  expect(screen.getByText(/^Ends .*, in 2[12] min$/)).toBeInTheDocument()
  expect(screen.getByTestId('tape-notch')).toBeInTheDocument()
  expect(label(container)).toMatch(/Ends .*in 2[12] min\.$/)
})

test('no animation class on first render, grows after a status change', () => {
  const { container, rerender } = render(<Tape status="pending" view={{}} />)
  expect(container.querySelector('.tape-fill--grow')).toBeNull()
  act(() => rerender(<Tape status="inspection_confirmed" view={{}} />))
  expect(container.querySelector('.tape-fill--grow')).not.toBeNull()
})

test('mini tape is hidden from assistive tech and has no labels', () => {
  const { container } = render(<Tape status="pending" view={{}} size="mini" />)
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  expect(container.textContent).toBe('')
})

test('SplitTape widths are proportional to the amounts', () => {
  render(<SplitTape total={10000000} depositAmount={7000000} balanceAmount={3000000} currency="NGN" />)
  expect(screen.getByTestId('split-deposit')).toHaveStyle({ width: '70%' })
  expect(screen.getByTestId('split-balance')).toHaveStyle({ width: '30%' })
  expect(screen.getByText(/^Deposit .*\(70%\)$/)).toBeInTheDocument()
  expect(screen.getByText(/^Balance .*\(30%\)$/)).toBeInTheDocument()
})
