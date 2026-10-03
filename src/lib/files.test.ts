import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { chatKey, MULTIPART_AT, pool, slug, upload, type Api } from './files'

/** Every PUT the browser would have sent, and how the store answers each. */
let puts: { url: string; size: number }[] = []
let refuse: (url: string) => boolean = () => false

class FakeXHR {
  status = 0
  upload: { onprogress?: (e: { loaded: number }) => void } = {}
  onload?: () => void
  onerror?: () => void
  onabort?: () => void
  private url = ''
  open(_method: string, url: string) {
    this.url = url
  }
  setRequestHeader() {}
  abort() {
    this.onabort?.()
  }
  send(body: Blob) {
    setTimeout(() => {
      if (refuse(this.url)) {
        this.status = 500
        this.onload?.()
        return
      }
      puts.push({ url: this.url, size: body.size })
      this.upload.onprogress?.({ loaded: body.size })
      this.status = 200
      this.onload?.()
    }, 0)
  }
}

/** A platform that answers the s3 routes the way apps/s3 does, recording each call. */
function platform(partSize: number, stored: { part: number; size: number }[] = []) {
  const calls: { method: string; path: string; body?: unknown; query?: unknown }[] = []
  const api: Api = {
    http: {
      json: (async (o: { method?: string; path: string; body?: unknown; query?: unknown }) => {
        const method = o.method ?? 'GET'
        calls.push({ method, path: o.path, body: o.body, query: o.query })
        if (method === 'POST' && o.path.endsWith('/objects')) return { url: 'https://s3/obj?sig', method: 'PUT' }
        if (method === 'POST' && o.path.endsWith('/uploads')) return { upload: 'up1', key: 'k', partSize }
        if (method === 'POST' && o.path.endsWith('/parts')) {
          const parts = (o.body as { parts: number[] }).parts
          return { urls: parts.map((part) => ({ part, url: `https://s3/k?uploadId=up1&partNumber=${part}` })), expiresIn: 300 }
        }
        if (method === 'GET' && o.path.includes('/uploads/')) return { upload: 'up1', key: 'k', parts: stored }
        if (method === 'POST' && o.path.endsWith('/complete')) return { key: 'k', etag: 'e-3', size: 0, parts: 3 }
        throw new Error(`unexpected ${method} ${o.path}`)
      }) as Api['http']['json'],
    },
  }
  return { api, calls }
}

const store = new Map<string, string>()

beforeEach(() => {
  puts = []
  refuse = () => false
  store.clear()
  ;(globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXHR
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    },
  }
})

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
})

const file = (bytes: number, name = 'big.bin') => new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream', lastModified: 1 })

describe('upload', () => {
  test('a small file is one presigned PUT straight to the store', async () => {
    const { api, calls } = platform(4 << 20)
    const seen: number[] = []
    await upload(api, 'hanzo', 'chat/a.txt', file(1000, 'a.txt'), (f) => seen.push(f))
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /v1/s3/buckets/hanzo/objects'])
    expect(puts).toEqual([{ url: 'https://s3/obj?sig', size: 1000 }])
    expect(seen.at(-1)).toBe(1)
  })

  test('a large file goes in parts, each a presigned PUT, and is completed by the platform', async () => {
    const part = 4 << 20
    const size = MULTIPART_AT + part + 123
    const { api, calls } = platform(part)
    const seen: number[] = []
    await upload(api, 'hanzo', 'chat/big.bin', file(size), (f) => seen.push(f))
    const n = Math.ceil(size / part)
    expect(puts.map((p) => p.size).reduce((a, b) => a + b, 0)).toBe(size)
    expect(puts).toHaveLength(n)
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/v1/s3/buckets/hanzo/uploads/up1/complete', body: { key: 'chat/big.bin' } })
    expect(Math.round(seen.at(-1)! * 1000)).toBe(1000)
    // The resume point is cleared once the upload completes.
    expect(store.size).toBe(0)
  })

  test('an interrupted upload resumes, sending only the parts the store does not hold', async () => {
    const part = 4 << 20
    const size = 3 * part
    const big = file(size)
    // The first attempt dies on part 2.
    refuse = (url) => url.includes('partNumber=2')
    const first = platform(part)
    await expect(upload(first.api, 'hanzo', 'chat/big.bin', big, () => {})).rejects.toThrow()
    expect([...store.values()]).toEqual([`up1 ${part}`])
    // The second asks the store what it has and sends the rest.
    refuse = () => false
    puts = []
    const done = puts
    const second = platform(part, [
      { part: 1, size: part },
      { part: 3, size: part },
    ])
    await upload(second.api, 'hanzo', 'chat/big.bin', big, () => {})
    expect(second.calls.some((c) => c.method === 'POST' && c.path.endsWith('/uploads'))).toBe(false)
    expect(done.map((p) => p.url)).toEqual(['https://s3/k?uploadId=up1&partNumber=2'])
  }, 20_000)
})

describe('pool', () => {
  test('runs every item and never more than n at once', async () => {
    let now = 0
    let most = 0
    const ran: number[] = []
    await pool([1, 2, 3, 4, 5, 6, 7], 3, async (i) => {
      now++
      most = Math.max(most, now)
      await new Promise((r) => setTimeout(r, 2))
      ran.push(i)
      now--
    })
    expect(ran.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(most).toBe(3)
  })
})

describe('names', () => {
  test("a workspace's bucket is its org, made DNS-safe", () => {
    expect(slug('Hanzo AI, Inc.')).toBe('hanzo-ai-inc')
    expect(slug('---')).toBe('workspace')
  })

  test("a chat's file keeps a dropped folder's path, and cannot climb out of it", () => {
    const f = file(1, 'a.md')
    Object.defineProperty(f, 'relative', { value: 'docs/../../a.md' })
    expect(chatKey(f)).toBe('chat/docs/a.md')
    expect(chatKey(file(1, 'b.md'))).toBe('chat/b.md')
  })
})
