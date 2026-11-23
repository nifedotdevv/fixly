import { render, screen } from '@testing-library/react'
import App from './App.jsx'

test('renders the heading', () => {
  render(<App />)
  expect(screen.getByRole('heading', { level: 1, name: /inspected, quoted and booked/ })).toBeInTheDocument()
})
