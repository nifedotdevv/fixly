import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import Landing from './Landing.jsx'

const BANNED =
  /elevate|unlock|supercharge|seamless|empower|streamline|leverage|all-in-one|journey|effortless|hassle-free|verified|trusted|top-rated/i

const setup = () =>
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  )

test('renders the h1, both CTAs and the example label', () => {
  setup()
  expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/inspected, quoted and booked/)
  expect(screen.getByRole('link', { name: 'Find an artisan' }).getAttribute('href')).toBe('/artisans')
  expect(screen.getByRole('link', { name: "I'm an artisan" }).getAttribute('href')).toBe('/register?role=artisan')
  expect(screen.getByText('Example request')).toBeTruthy()
})

test('copy contains no banned words', () => {
  const { container } = setup()
  expect(container.textContent).not.toMatch(BANNED)
  for (const el of container.querySelectorAll('[aria-label]')) {
    expect(el.getAttribute('aria-label')).not.toMatch(BANNED)
  }
})
