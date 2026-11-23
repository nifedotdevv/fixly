import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import forms from './index.js'

// Radix radio group measures with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }

const mk = (result = {}) => ({ mutateAsync: vi.fn().mockResolvedValue(result), isPending: false, errors: [], conflict: false })
const act = (id, label) => ({ id, label })

describe('homeowner action forms', () => {
  it('maps the three actions', () => {
    expect(Object.keys(forms).sort()).toEqual(['add-note', 'report-problem', 'review'])
  })

  it('note sends {text} and clears after success', async () => {
    const mutation = mk()
    const Form = forms['add-note']
    const action = act('add-note', 'Add note')
    render(<Form action={action} mutation={mutation} />)
    const box = screen.getByLabelText('Add a note for the artisan')
    await userEvent.type(box, 'Gate code is 1234')
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(mutation.mutateAsync).toHaveBeenCalledWith({ action, body: { text: 'Gate code is 1234' } })
    expect(box).toHaveValue('')
  })

  it('note keeps its text on error and shows server errors', async () => {
    const mutation = { ...mk(), errors: ['text is too long'] }
    mutation.mutateAsync.mockRejectedValue(new Error('x'))
    const Form = forms['add-note']
    render(<Form action={act('add-note', 'Add note')} mutation={mutation} />)
    const box = screen.getByLabelText('Add a note for the artisan')
    await userEvent.type(box, 'hello')
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(box).toHaveValue('hello')
    expect(screen.getByText('text is too long')).toBeInTheDocument()
  })

  it('review sends a numeric rating', async () => {
    const mutation = mk()
    const Form = forms.review
    const action = act('review', 'Leave a review')
    render(<Form action={action} mutation={mutation} />)
    await userEvent.click(screen.getByRole('button', { name: 'Submit review' }))
    expect(mutation.mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByText('Choose a rating.')).toBeInTheDocument()
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-invalid', 'true')
    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }))
    await userEvent.type(screen.getByLabelText(/Comment/), 'Tidy work')
    await userEvent.click(screen.getByRole('button', { name: 'Submit review' }))
    expect(mutation.mutateAsync).toHaveBeenCalledWith({ action, body: { rating: 4, comment: 'Tidy work' } })
  })

  it('arrow keys change the rating', async () => {
    const Form = forms.review
    render(<Form action={act('review', 'Leave a review')} mutation={mk()} />)
    await userEvent.click(screen.getByRole('radio', { name: '2 stars' }))
    // Radix moves focus on a timeout after keydown; userEvent's instant keyup would cancel the check.
    fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByRole('radio', { name: '3 stars' })).toBeChecked())
    expect(screen.getByText('3 out of 5')).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByRole('radio', { name: '2 stars' })).toBeChecked())
    fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByRole('radio', { name: '1 star' })).toBeChecked())
  })

  it('problem form needs a confirm before it sends', async () => {
    const mutation = mk()
    const Form = forms['report-problem']
    const action = act('report-problem', 'Report a problem')
    render(<Form action={action} mutation={mutation} />)
    const trigger = screen.getByRole('button', { name: 'Report a problem' })
    expect(trigger).toBeEnabled()
    await userEvent.click(trigger)
    expect(screen.getByText('Describe the problem.')).toBeInTheDocument()
    expect(screen.getByLabelText("What's wrong?")).toHaveFocus()
    expect(mutation.mutateAsync).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText("What's wrong?"), 'Tap still leaks')
    await userEvent.click(trigger)
    expect(mutation.mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByText(/Fixly support will review the job/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Report problem' }))
    expect(mutation.mutateAsync).toHaveBeenCalledWith({ action, body: { explanation: 'Tap still leaks' } })
  })
})
