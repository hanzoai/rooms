import { afterEach, describe, expect, test, vi } from 'vitest'
import { createKey, keys, revokeKey } from './org'

/** Every request the client sends, answered from `reply`. */
function wire(reply: (method: string, path: string) => unknown) {
  const sent: { method: string; path: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'https://api.hanzo.ai').pathname
    const method = init?.method ?? 'GET'
    sent.push({ method, path, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
    return new Response(JSON.stringify(reply(method, path)), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  return sent
}

afterEach(() => vi.unstubAllGlobals())

describe('API keys: many per person, one revoked at a time', () => {
  test('lists every key the reader may see', async () => {
    wire(() => ({ keys: [{ id: 'a', name: 'ci', type: 'secret', status: 'active' }, { id: 'b', name: 'web', type: 'publishable', status: 'revoked' }] }))
    expect((await keys()).map((k) => k.id)).toEqual(['a', 'b'])
  })

  test('a create is a new key with a name, and answers its value once', async () => {
    const sent = wire(() => ({ id: 'z-secret-1', name: 'ci', type: 'secret', status: 'active', key: 'sk-live-1' }))
    const made = await createKey({ name: 'ci', type: 'secret' })
    expect(made.key).toBe('sk-live-1')
    expect(sent).toEqual([{ method: 'POST', path: '/v1/account/keys', body: { name: 'ci', type: 'secret' } }])
  })

  test('a revoke names exactly one key', async () => {
    const sent = wire(() => ({ id: 'z~a-secret-1', status: 'revoked' }))
    await revokeKey('z~a-secret-1')
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual(['DELETE /v1/account/keys/z~a-secret-1'])
  })
})
