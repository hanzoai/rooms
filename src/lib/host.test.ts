import { describe, expect, test } from 'vitest'
import { app, CHAT, DEV, dev, page, place, talk } from './host'
import { configure } from '../where'

const RUN = `sess_${'0123456789abcdef'.repeat(2)}`
const FLOW = `flow_${'0123456789abcdef'.repeat(2)}`
const THREAD = '1790205245190697166-000014'

describe('the app is two roots of paths', () => {
  test('Chat is /chat, and a conversation is a path under it', () => {
    expect(talk()).toBe(CHAT)
    expect(talk(null)).toBe('/chat')
    expect(talk(THREAD)).toBe(`/chat/${THREAD}`)
    expect(talk('a b/c')).toBe('/chat/a%20b%2Fc')
  })

  test('Dev is /dev, and every builder address is a path under it', () => {
    expect(app('')).toBe(DEV)
    expect(app(RUN)).toBe(`/dev/run/${RUN}`)
    expect(app('hanzo/circle')).toBe('/dev/projects/hanzo/circle')
    expect(app('my-site')).toBe('/dev/projects/my-site')
    expect(app('-/projects')).toBe('/dev/projects')
    expect(app('/-/projects/')).toBe('/dev/projects')
    expect(app('-/sync')).toBe('/dev/sync')
    expect(app('-/issues')).toBe('/dev/issues')
    expect(app('-/artifacts')).toBe('/dev/artifacts')
    expect(app('-/templates')).toBe('/dev/templates')
    expect(app('-/automations')).toBe('/dev/automations')
    expect(app(`-/automations/${FLOW}`)).toBe(`/dev/automations/${FLOW}`)
    expect(app('-/settings/machines')).toBe('/dev/machines')
    expect(app('-/settings/environments')).toBe('/dev/environments')
    expect(app('-/customize')).toBe('/dev/customize')
    expect(app('-/customize/connectors')).toBe('/dev/customize/connectors')
    expect(app('-/settings/usage')).toBe('/dev/settings/usage')
    expect(app('-/plans')).toBe('/dev/plans')
    expect(app('../../etc'), 'what is not an address is New').toBe(DEV)
  })

  test('a path reads back as the place that wrote it', () => {
    expect(place('/chat')).toEqual({ mode: 'chat', thread: null })
    expect(place('/chat/')).toEqual({ mode: 'chat', thread: null })
    expect(place(talk(THREAD))).toEqual({ mode: 'chat', thread: THREAD })
    expect(place(talk('a b/c'))).toEqual({ mode: 'chat', thread: 'a b/c' })
    for (const at of ['', RUN, 'hanzo/circle', 'my-site', '-/projects', '-/sync', '-/settings/machines', '-/settings/environments', '-/customize/plugins', `-/automations/${FLOW}`, '-/plans'])
      expect(place(app(at)), at || 'New').toEqual({ mode: 'dev', at })
    expect(place('/dev/elsewhere'), 'a path under /dev that names nothing is New').toEqual({ mode: 'dev', at: '' })
    expect(place('/dev/codebase'), 'the retired Codebase is New').toEqual({ mode: 'dev', at: '' })
  })

  test('what is not the app is no place', () => {
    for (const p of ['/', '/chat/shared', '/chat/a/b', '/developers', '/chatter', '/pricing', '/devices'])
      expect(place(p), p).toBeNull()
  })

  test('analytics counts a record as its kind', () => {
    expect(page('/chat')).toBe('/chat')
    expect(page(talk(THREAD))).toBe('/chat/:id')
    expect(page(app(RUN))).toBe('/dev/run/:id')
    expect(page(app('hanzo/circle'))).toBe('/dev/projects/:org/:repo')
    expect(page(app('my-site'))).toBe('/dev/projects/:slug')
    expect(page(app(`-/automations/${FLOW}`))).toBe('/dev/automations/:id')
    expect(page(app('-/automations/new'))).toBe('/dev/automations/new')
    expect(page('/dev/projects')).toBe('/dev/projects')
    expect(page('/dev/settings/machines'), 'counted at the path that writes it').toBe('/dev/machines')
    expect(page('/pricing')).toBe('/pricing')
  })

  test('the door opens a run, a repository or a site and nothing else, on the host the app is on', () => {
    expect(dev()).toBe('/dev')
    expect(dev(RUN)).toBe(`/dev/run/${RUN}`)
    expect(dev('hanzo/circle')).toBe('/dev/projects/hanzo/circle')
    expect(dev('my-site')).toBe('/dev/projects/my-site')
    for (const odd of ['https://evil.example', '//evil.example', '../etc', 'a/b/c', '-/settings', 'Mega Shop']) expect(dev(odd), odd).toBe('/dev')
    configure({ site: 'https://hanzo.ai' })
    expect(dev(RUN)).toBe(`https://hanzo.ai/dev/run/${RUN}`)
    configure({ site: '' })
  })
})
