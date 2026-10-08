import { describe, expect, it } from 'vitest'

import { app, dev, under } from './host'

const RUN = `sess_${'0123456789abcdef'.repeat(2)}`

describe('Dev’s addresses are paths under /dev', () => {
  it('writes an app address as a path', () => {
    expect(app('')).toBe('/dev')
    expect(app(RUN)).toBe(`/dev/${RUN}`)
    expect(app('hanzo/circle')).toBe('/dev/hanzo/circle')
    expect(app('-/settings/billing')).toBe('/dev/-/settings/billing')
    expect(app('/-/projects/')).toBe('/dev/-/projects')
  })

  it('reads the app address back from a pathname, and nothing from one that is not Dev’s', () => {
    expect(under('/dev')).toBe('')
    expect(under('/dev/')).toBe('')
    expect(under('/dev/hanzo/circle')).toBe('hanzo/circle')
    expect(under(`/dev/${RUN}`)).toBe(RUN)
    expect(under('/dev/-/customize/plugins')).toBe('-/customize/plugins')
    expect(under('/dev/hanzo/a%20b')).toBe('hanzo/a b')
    expect(under('/')).toBeNull()
    expect(under('/developers')).toBeNull()
    expect(under('/chat')).toBeNull()
    expect(under(null)).toBeNull()
  })

  it('opens Dev on a run, a repository or a site, and on New for anything else', () => {
    expect(dev()).toBe('/dev')
    expect(dev(RUN)).toBe(`/dev/${RUN}`)
    expect(dev('hanzo/circle')).toBe('/dev/hanzo/circle')
    expect(dev('mega-shop')).toBe('/dev/mega-shop')
    for (const odd of ['https://evil.example', '//evil.example', '../etc', 'a/b/c', '-/settings', 'Mega Shop']) expect(dev(odd)).toBe('/dev')
  })
})
