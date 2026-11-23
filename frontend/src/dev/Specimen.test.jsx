import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Specimen from './Specimen.jsx'
import { oklchContrast, oklchToLinear } from './contrast.js'
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

test('the stage steps section renders every request status', () => {
  render(<MemoryRouter><Specimen /></MemoryRouter>)
  for (const status of REQUEST_STATUSES) expect(screen.getAllByText(status).length).toBeGreaterThan(0)
})

test('lime and success tokens meet 4.5:1 and success is in gamut', () => {
  const ink = [0.22, 0.02, 100]
  const muted = [0.50, 0.012, 100]
  const lime = [0.90, 0.19, 128]
  const limeSoft = [0.965, 0.06, 128]
  const success = [0.47, 0.09, 165]
  const successSoft = [0.955, 0.035, 165]
  const white = [1, 0, 0]
  const pairs = [[ink, lime], [ink, limeSoft], [muted, limeSoft], [success, successSoft], [success, white]]
  for (const [a, b] of pairs) expect(oklchContrast(a, b)).toBeGreaterThanOrEqual(4.5)
  for (const v of oklchToLinear(...success)) {
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(1)
  }
})
