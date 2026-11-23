import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Specimen from './Specimen.jsx'
import { REQUEST_STATUSES } from '../lib/requestStatus.js'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

test('renders the type scale and every step label', () => {
  render(<MemoryRouter><Specimen /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Design specimen' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Type scale' })).toBeInTheDocument()
  for (const label of ['caption 13px', 'body 16px', 'h3 20px', 'h2 25px', 'h1 31px', 'display 39px']) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
})

test('the tape section renders every request status', () => {
  render(<MemoryRouter><Specimen /></MemoryRouter>)
  for (const status of REQUEST_STATUSES) expect(screen.getAllByText(status).length).toBeGreaterThan(0)
})
