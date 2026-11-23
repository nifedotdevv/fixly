import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import PublicLayout from '../layouts/PublicLayout.jsx'
import { AuthContext } from '../auth/auth-context.js'
import Landing from './Landing.jsx'

const BANNED =
  /elevate|unlock|supercharge|seamless|empower|streamline|leverage|all-in-one|journey|effortless|hassle-free|verified|trusted|top-rated/i

const setup = () =>
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  )

// Pretend to be a desktop so the card accordion is active.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query) => ({
    matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {},
  }))
})
afterEach(() => vi.unstubAllGlobals())

test('renders the h1 and both hero CTAs', () => {
  setup()
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Home repairs with every step on record.')
  const find = screen.getAllByRole('link', { name: 'Find an artisan' })
  for (const link of find) expect(link.getAttribute('href')).toBe('/artisans')
  expect(screen.getByRole('link', { name: "I'm an artisan" }).getAttribute('href')).toBe('/register?role=artisan')
})

test('copy contains no banned words', () => {
  const { container } = setup()
  expect(container.textContent).not.toMatch(BANNED)
  for (const el of container.querySelectorAll('[aria-label]')) {
    expect(el.getAttribute('aria-label')).not.toMatch(BANNED)
  }
})

test('no middots, arrows or bullets in the text', () => {
  const { container } = setup()
  expect(container.textContent).not.toMatch(/·|→|•/)
})

test('feature tabs: arrow keys move and show the panel, next wraps', async () => {
  const user = userEvent.setup()
  setup()
  const tabs = screen.getAllByRole('tab')
  expect(tabs).toHaveLength(4)
  expect(tabs[0].getAttribute('aria-selected')).toBe('true')
  tabs[0].focus()
  await user.keyboard('{ArrowRight}')
  expect(tabs[1].getAttribute('aria-selected')).toBe('true')
  expect(document.activeElement).toBe(tabs[1])
  const panel = screen.getByRole('tabpanel')
  expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe('One price, in writing. Your call.')
  await user.keyboard('{End}')
  expect(tabs[3].getAttribute('aria-selected')).toBe('true')
  await user.click(screen.getByRole('button', { name: 'Next feature' }))
  expect(tabs[0].getAttribute('aria-selected')).toBe('true')
})

test('stage cards: clicking Quote expands it and collapses the first', async () => {
  const user = userEvent.setup()
  setup()
  const request = screen.getByRole('button', { name: 'Request' })
  const quote = screen.getByRole('button', { name: 'Quote' })
  expect(request.getAttribute('aria-expanded')).toBe('true')
  expect(quote.getAttribute('aria-expanded')).toBe('false')
  await user.click(quote)
  expect(quote.getAttribute('aria-expanded')).toBe('true')
  expect(request.getAttribute('aria-expanded')).toBe('false')
})

test('stage cards render as plain headings when matchMedia is missing', () => {
  vi.stubGlobal('matchMedia', undefined)
  setup()
  expect(screen.queryByRole('button', { name: 'Quote' })).toBeNull()
  expect(screen.getByRole('heading', { level: 3, name: 'Quote' })).toBeTruthy()
})

test('artisan list: activating an item marks it current', async () => {
  const user = userEvent.setup()
  setup()
  const first = screen.getByRole('button', { name: 'You set the price' })
  const second = screen.getByRole('button', { name: 'No double-booking' })
  expect(first.getAttribute('aria-current')).toBe('true')
  await user.click(second)
  expect(second.getAttribute('aria-current')).toBe('true')
  expect(first.getAttribute('aria-current')).toBeNull()
})

const FOCUSABLE = 'a, button, input, select, textarea, [tabindex]'

test('every Sample data mock is aria-hidden with nothing focusable inside', () => {
  const { container } = setup()
  const captions = [...container.querySelectorAll('p')].filter((p) => p.textContent === 'Sample data')
  // Four tab mocks, four stage mocks and the artisan mocks.
  expect(captions.length).toBeGreaterThanOrEqual(12)
  for (const caption of captions) {
    const mock = caption.closest('[aria-hidden="true"]')
    expect(mock).not.toBeNull()
    expect(mock.querySelectorAll(FOCUSABLE)).toHaveLength(0)
  }
})

test('feature tab mocks show the real app shell: list tabs, steps and money', () => {
  const { container } = setup()
  expect(container.querySelector('#panel-inspection').textContent).toMatch(/Needs you 2.*Waiting 1/)
  expect(container.querySelector('#panel-quote').textContent).toMatch(/₦85,000\.00/)
})

test('audiences section: one h2, two h3s and sign-up links to /register', () => {
  setup()
  const section = screen.getByRole('region', { name: 'Built for both sides of the job' })
  expect(within(section).getAllByRole('heading', { level: 2 })).toHaveLength(1)
  expect(within(section).getAllByRole('heading', { level: 3 })).toHaveLength(2)
  const links = within(section).getAllByRole('link')
  expect(links).toHaveLength(2)
  for (const a of links) expect(a.getAttribute('href')).toMatch(/^\/register/)
  expect(within(section).getByRole('link', { name: 'Sign up as an artisan' }).getAttribute('href')).toBe('/register?role=artisan')
  expect(within(section).getAllByRole('listitem')).toHaveLength(6)
})

test('stage cards: Request starts expanded and each card owns its extra region', async () => {
  const user = userEvent.setup()
  setup()
  const buttons = ['Request', 'Inspect', 'Quote', 'Repair'].map((name) => screen.getByRole('button', { name }))
  buttons.forEach((b, i) => expect(b.getAttribute('aria-controls')).toBe(`stage-extra-${i}`))
  await user.click(buttons[3])
  expect(buttons.map((b) => b.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'false', 'true'])
})

function setupFooter(status = 'signed-out') {
  render(
    <AuthContext.Provider value={{ status, me: null }}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<p>Home</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return screen.getByRole('contentinfo')
}

test('footer: three columns, only links to routes that exist', () => {
  const footer = setupFooter()
  expect(footer.textContent).toContain('Fixly connects homeowners with artisans')
  expect(within(footer).getByRole('heading', { level: 2, name: 'Product' })).toBeTruthy()
  expect(within(footer).getByRole('heading', { level: 2, name: 'For artisans' })).toBeTruthy()
  const hrefs = within(footer).getAllByRole('link').map((a) => a.getAttribute('href'))
  expect(hrefs).toEqual(['/artisans', '/register', '/login', '/register?role=artisan', '/login'])
  expect(within(footer).getByRole('link', { name: 'Artisan sign in' }).getAttribute('href')).toBe('/login')
  expect(footer.textContent).toContain(`\u00a9 ${new Date().getFullYear()} Fixly`)
  expect(footer.textContent).not.toMatch(/·|→|•/)
})

test('footer hides sign-in links and the artisan column when signed in', () => {
  const footer = setupFooter('signed-in')
  expect(within(footer).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/artisans'])
  expect(within(footer).queryByRole('heading', { name: 'For artisans' })).toBeNull()
})

test('stage cards: every card shows an aria-hidden mini mock while collapsed', () => {
  const { container } = setup()
  const cards = container.querySelectorAll('.stage-card')
  expect(cards).toHaveLength(4)
  for (const card of cards) {
    const peek = card.querySelector('.stage-peek')
    expect(peek).not.toBeNull()
    expect(peek.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(peek.textContent).toMatch(/Sample data/)
    expect(peek.querySelectorAll(FOCUSABLE)).toHaveLength(0)
  }
})
