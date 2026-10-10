import { createElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'

// The drawing libraries are not under test and do not load outside a bundler.
// Each primitive draws its children, and a menu row records its words and its
// press, so the open menu can be read in order and pressed.
const { rows, shut } = vi.hoisted(() => ({ rows: [] as { label: string; press: () => void }[], shut: vi.fn() }))

/** The words under a node, in order. */
const words = (node: ReactNode): string[] =>
  typeof node === 'string' ? [node] : Array.isArray(node) ? node.flatMap(words) : isValidElement<{ children?: ReactNode }>(node) ? words(node.props.children) : []

vi.mock('@hanzo/gui', () => {
  const Draw = ({ children }: { children?: ReactNode }) => createElement('div', null, children)
  const Row = (props: { children?: ReactNode; onPress?: () => void; 'data-item'?: string }) => {
    if (props['data-item'] !== undefined) rows.push({ label: words(props.children)[0] ?? '', press: props.onPress ?? (() => {}) })
    return Draw(props)
  }
  const Popover = Object.assign(Draw, { Anchor: Draw, Content: Draw })
  return { Popover, SizableText: Draw, View: Draw, XStack: Row, YStack: Draw }
})
vi.mock('@hanzo/ui', () => ({ Button: () => null, Dialog: () => null, DialogContent: () => null, DialogTitle: () => null, Input: () => null }))
vi.mock('@hanzo/ui/glass', () => ({ glass: () => ({}) }))
vi.mock('@hanzo/iam/react', () => ({ useOrganizations: () => ({ roles: { acme: 'owner' } }) }))
vi.mock('@hanzo/build', () => ({
  label: () => null,
  Meter: () => null,
  path: (r: { kind: string; section?: string; screen?: string }) => (r.kind === 'settings' ? `-/settings/${r.section}` : `-/${r.screen}`),
  said: () => '',
  useStanding: () => ({ value: null, error: null, loading: false }),
  useWho: () => ({ open: true, onOpenChange: shut, toggle: () => {} }),
}))
vi.mock('./lib/session', () => ({ org: () => 'acme', orgs: () => ['acme'], pick: () => {}, renew: () => {}, scope: () => ({}), superAdmin: () => false }))
vi.mock('./lib/org', () => ({ createOrg: async () => '', say: String }))
vi.mock('./Support', () => ({ SupportPicker: () => null }))

import { Me } from './Me'
import APP from './lib/rooms.json' with { type: 'json' }

/** The account menu, open, as its rows. */
function menu() {
  rows.length = 0
  const go = vi.fn()
  const host = { org: 'acme', person: { name: 'Ada', email: 'ada@acme.dev' }, go, signOut: () => {} }
  renderToStaticMarkup(createElement(Me, { host: host as never, onOrg: () => {} }))
  return { rows: [...rows], go }
}

afterEach(() => {
  vi.unstubAllGlobals()
  shut.mockClear()
})

describe('the account menu', () => {
  test('lists Billing and API keys between Usage and View all plans, and no balance', () => {
    const labels = menu().rows.map((r) => r.label)
    const at = labels.indexOf('Usage')
    expect(labels.slice(at, at + 4)).toEqual(['Usage', 'Billing', 'API keys', 'View all plans'])
    expect(labels).not.toContain('Add funds')
  })

  test("API keys closes the menu and opens the organization's keys page, one the app serves", () => {
    const assign = vi.fn()
    vi.stubGlobal('window', { location: { assign } })
    const open = menu()
    open.rows.find((r) => r.label === 'API keys')?.press()
    expect(shut).toHaveBeenCalledWith(false)
    expect(assign).toHaveBeenCalledWith('/settings/organization/keys')
    expect(open.go).not.toHaveBeenCalled()
    expect(APP).toContain('/settings/organization/keys')
  })
})
