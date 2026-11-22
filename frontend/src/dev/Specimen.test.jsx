import { render, screen } from '@testing-library/react'
import Specimen from './Specimen.jsx'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

test('renders the type scale and every step label', () => {
  render(<Specimen />)
  expect(screen.getByRole('heading', { name: 'Design specimen' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Type scale' })).toBeInTheDocument()
  for (const label of ['caption 13px', 'body 16px', 'h3 20px', 'h2 25px', 'h1 31px', 'display 39px']) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
})
