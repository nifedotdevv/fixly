import { render, screen } from '@testing-library/react'
import App from './App.jsx'

test('renders the heading', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Fixly' })).toBeInTheDocument()
})
