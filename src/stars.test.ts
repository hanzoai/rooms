import { afterEach, describe, expect, test } from 'vitest'
import { carry } from './stars'

const KEY = 'hanzo.starred-threads'

/** This browser's storage, as a test holds it. */
function storage(seed: Record<string, string>) {
  const held = new Map(Object.entries(seed))
  const store = {
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => void held.set(k, v),
    removeItem: (k: string) => void held.delete(k),
  }
  Object.assign(globalThis, { localStorage: store })
  return held
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('stars from before pins were the server’s', () => {
  test('each is asked for as a pin, once, and the stars are forgotten', async () => {
    const held = storage({ [KEY]: JSON.stringify(['a', 'b']) })
    const asked: string[] = []
    expect(await carry(async (id) => void asked.push(id))).toBe(true)
    expect(asked).toEqual(['a', 'b'])
    expect(held.has(KEY)).toBe(false)
    expect(await carry(async (id) => void asked.push(id))).toBe(false)
    expect(asked).toEqual(['a', 'b'])
  })

  test('a store that takes no pin keeps them for a later visit', async () => {
    const held = storage({ [KEY]: JSON.stringify(['a', 'b']) })
    expect(await carry(() => Promise.reject(new Error('404 page not found')))).toBe(false)
    expect(held.get(KEY)).toBe(JSON.stringify(['a', 'b']))
  })

  test('one the store no longer holds does not keep the rest', async () => {
    const held = storage({ [KEY]: JSON.stringify(['gone', 'b']) })
    expect(await carry((id) => (id === 'gone' ? Promise.reject(new Error('not found')) : Promise.resolve()))).toBe(true)
    expect(held.has(KEY)).toBe(false)
  })

  test('nothing starred, or nothing readable, asks nothing', async () => {
    let asked = 0
    storage({})
    expect(await carry(async () => void asked++)).toBe(false)
    storage({ [KEY]: '{not json' })
    expect(await carry(async () => void asked++)).toBe(false)
    expect(asked).toBe(0)
  })
})
