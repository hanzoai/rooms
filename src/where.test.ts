import { describe, expect, test } from 'vitest'
import { brand, configure, site, where } from './where'
import { safe, signUp } from './lib/destination'

describe('addresses', () => {
  test('a host states only what differs, and reads happen at call time', () => {
    expect(where()).toMatchObject({ site: '', home: '/home', signUp: '/signup' })
    configure({ site: 'https://hanzo.ai', home: '/', signUp: '/start' })
    expect(site('/pricing')).toBe('https://hanzo.ai/pricing')
    expect(signUp()).toBe('/start')
    configure({ api: 'https://api.hanzo.ai' })
    expect(where()).toMatchObject({ site: 'https://hanzo.ai', home: '/', api: 'https://api.hanzo.ai' })
  })
})

describe('brand', () => {
  test("the rooms print the host's product name, hanzo.ai's until a host states its own", () => {
    configure({ brand: undefined })
    expect(brand()).toBe('Hanzo AI')
    configure({ brand: 'Hanzo Team' })
    expect(brand()).toBe('Hanzo Team')
  })
})

describe('safe', () => {
  test('keeps a path on this origin', () => {
    expect(safe('/cal?at=1')).toBe('/cal?at=1')
    expect(safe('/start')).toBe('/start')
  })

  test('refuses an address that leaves the origin', () => {
    for (const away of ['//evil.example', '/\\evil.example', '/\t/evil.example', 'https://evil.example', 'cal'])
      expect(safe(away)).toBe('/')
  })

  test('refuses the pages that restart sign-in', () => {
    expect(safe('/login')).toBe('/')
    expect(safe('/login/', '/home')).toBe('/home')
  })
})
