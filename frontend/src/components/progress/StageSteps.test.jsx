import { act, render, screen } from '@testing-library/react'
import { StageSteps, SplitBar } from './index.js'

const label = (c) => c.querySelector('[role="img"]').getAttribute('aria-label')

test('aria-label names the stage and the next one', () => {
  const { container } = render(<StageSteps status="inspection_completed" view={{}} />)
  expect(label(container)).toBe('Stage 3 of 7: Inspected. Next: Quoted.')
})

test('completed has no next stage', () => {
  const { container } = render(<StageSteps status="completed" view={{}} />)
  expect(label(container)).toBe('Stage 7 of 7: Settled. Complete.')
})

test('cancelled after a quote ends at Quoted', () => {
  const { container } = render(<StageSteps status="cancelled" view={{ quote: { total: 1 } }} />)
  expect(label(container)).toBe('Ended at stage 4 of 7: Quoted. Cancelled.')
})

test('ended statuses render the ended marker, others do not', () => {
  const { rerender } = render(<StageSteps status="rejected" view={{}} />)
  expect(screen.getByTestId('steps-ended')).toBeInTheDocument()
  rerender(<StageSteps status="pending" view={{}} />)
  expect(screen.queryByTestId('steps-ended')).not.toBeInTheDocument()
})

test('problem_reported renders the error marker', () => {
  render(<StageSteps status="problem_reported" view={{}} />)
  expect(screen.getByTestId('steps-problem')).toBeInTheDocument()
})

test('deadline line renders in the label and as text', () => {
  const deadline = new Date(Date.now() + 22 * 60000).toISOString()
  const { container } = render(<StageSteps status="quote_submitted" view={{}} deadline={deadline} />)
  expect(screen.getByText(/^Quote expires .*, in 2[12] min$/)).toBeInTheDocument()
  expect(screen.getByTestId('steps-deadline')).toBeInTheDocument()
  expect(label(container)).toMatch(/Quote expires .*in 2[12] min\.$/)
})

test('the deadline line names what is due, and what was due once it passed', () => {
  const soon = new Date(Date.now() + 60 * 60000).toISOString()
  const past = new Date(Date.now() - 5 * 60000).toISOString()
  const { rerender } = render(<StageSteps status="pending" view={{}} deadline={soon} />)
  expect(screen.getByTestId('steps-deadline')).toHaveTextContent(/^Reply due .*, in (1 h|60 min)/)
  rerender(<StageSteps status="awaiting_inspection_payment" view={{}} deadline={soon} />)
  expect(screen.getByTestId('steps-deadline')).toHaveTextContent(/^Payment due /)
  rerender(<StageSteps status="awaiting_repair_deposit" view={{}} deadline={past} />)
  expect(screen.getByTestId('steps-deadline')).toHaveTextContent(/^Deposit was due /)
  expect(document.body.textContent).not.toMatch(/\bEnds\b/)
})

test('no transition on first render, colours fade after a status change', () => {
  const { container, rerender } = render(<StageSteps status="pending" view={{}} />)
  expect(container.querySelector('.transition-\\[background-color\\,border-color\\]')).toBeNull()
  act(() => rerender(<StageSteps status="inspection_confirmed" view={{}} />))
  expect(container.querySelector('.transition-\\[background-color\\,border-color\\]')).not.toBeNull()
})

test('mini steps are hidden from assistive tech and has no labels', () => {
  const { container } = render(<StageSteps status="pending" view={{}} size="mini" />)
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  expect(container.textContent).toBe('')
})

test('SplitBar widths are proportional to the amounts', () => {
  render(<SplitBar total={10000000} depositAmount={7000000} balanceAmount={3000000} currency="NGN" />)
  expect(screen.getByTestId('split-deposit')).toHaveStyle({ width: '70%' })
  expect(screen.getByTestId('split-balance')).toHaveStyle({ width: '30%' })
  expect(screen.getByText(/^Deposit .*\(70%\)$/)).toBeInTheDocument()
  expect(screen.getByText(/^Balance .*\(30%\)$/)).toBeInTheDocument()
})

test('SplitBar renders nothing when total is 0', () => {
  const { container } = render(<SplitBar total={0} depositAmount={0} balanceAmount={0} />)
  expect(container).toBeEmptyDOMElement()
})
