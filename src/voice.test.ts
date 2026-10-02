import { describe, expect, it, vi } from 'vitest'

// The drawing libraries are not under test and do not load outside a bundler;
// what is tested here is the casting, the stand-in and the filter.
vi.mock('@hanzo/ui', () => ({}))
vi.mock('@hanzo/gui', () => ({}))
vi.mock('@hanzo/iam/react', () => ({}))
import { CAST, VOICES, voiceOf, voiceProfileOf } from './cast'
import { standIn } from './speech'
import { chats } from './lib/limits'

/** The speech service's American and British voices, as it names them. */
const SERVED = new Set([
  'af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
])

describe('the cast reads in the speech service’s own voices', () => {
  it('casts every part, and every fallback, in a voice the service serves', () => {
    for (const [name, role] of Object.entries(CAST)) expect(SERVED, name).toContain(role.voice)
    for (const voice of VOICES) expect(SERVED).toContain(voice)
    expect(SERVED).toContain(voiceOf('somebody nobody cast'))
    expect(voiceOf(undefined)).toBe('af_heart')
  })

  it('gives no two characters one voice; a house part sounds like the face it wears', () => {
    const characters = Object.entries(CAST).filter(([name]) => !name.startsWith('hanzo '))
    const voices = characters.map(([, role]) => role.voice)
    expect(new Set(voices).size).toBe(voices.length)
    expect(voiceOf('Hanzo Coder')).toBe(voiceOf('dev'))
    expect(voiceOf('Hanzo Researcher')).toBe(voiceOf('feynman'))
    expect(voiceOf('Hanzo Support')).toBe(voiceOf('nora'))
  })

  it('reads register and accent off the voice id', () => {
    expect(voiceProfileOf('einstein')).toEqual({ voice: 'bm_george', gender: 'male', accent: 'british' })
    expect(voiceProfileOf('des')).toEqual({ voice: 'af_bella', gender: 'female', accent: 'american' })
  })
})

describe('the browser voice that stands in for a refused platform', () => {
  const voices = [
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Samantha', lang: 'en-US' },
    { name: 'Daniel', lang: 'en-GB' },
    { name: 'Google UK English Female', lang: 'en-GB' },
    { name: 'Thomas', lang: 'fr-FR' },
  ]

  it('matches the cast voice’s accent and register', () => {
    expect(standIn(voiceProfileOf('einstein'), voices)).toBe('Daniel')
    expect(standIn(voiceProfileOf('maya'), voices)).toBe('Google UK English Female')
    expect(standIn(voiceProfileOf('des'), voices)).toBe('Samantha')
  })

  it('never reads "Female" as male, and takes English over nothing', () => {
    expect(standIn(voiceProfileOf('dev'), [{ name: 'Google UK English Female', lang: 'en-GB' }])).toBe('Google UK English Female')
    expect(standIn(voiceProfileOf('dev'), [{ name: 'Thomas', lang: 'fr-FR' }])).toBe('Thomas')
    expect(standIn(voiceProfileOf('dev'), [])).toBeUndefined()
  })
})

describe('a chat turn is offered only to a model that answers in text', () => {
  it('leaves out the transcriber and the voice the catalog lists beside the chat models', () => {
    const catalog = [
      { id: 'enso-auto' },
      { id: 'zen-max', outputs: ['text'] },
      { id: 'zen-scribe', outputs: ['transcript'] },
      { id: 'zen-voice-mini', outputs: ['audio'] },
      { id: 'zen-omni', outputs: ['text', 'audio'] },
    ]
    expect(catalog.filter(chats).map((m) => m.id)).toEqual(['enso-auto', 'zen-max', 'zen-omni'])
  })
})

describe('an agent speaks through the platform', () => {
  /** The one player the mouth makes, and whether it is playing. */
  class Player {
    static last: Player | null = null
    src = ''
    paused = true
    onended: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor() {
      Player.last = this
    }
    load() {}
    async play() {
      this.paused = false
    }
    pause() {
      this.paused = true
    }
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  function page(answer: () => Response) {
    const sent: { url: string; auth: string | null; body: Record<string, unknown> }[] = []
    const said: string[] = []
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('location', { hostname: 'hanzo.ai', origin: 'https://hanzo.ai' })
    vi.stubGlobal('Audio', Player)
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [{ name: 'Daniel', lang: 'en-GB' }],
      speak: (line: { text: string; onend?: () => void }) => {
        said.push(line.text)
        line.onend?.()
      },
      cancel: () => {},
    })
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        voice: unknown = null
        onend: (() => void) | null = null
        onerror: (() => void) | null = null
        constructor(public text: string) {}
      },
    )
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      sent.push({ url, auth: new Headers(init.headers).get('Authorization'), body: JSON.parse(init.body as string) })
      return answer()
    })
    URL.createObjectURL = () => 'blob:reply'
    URL.revokeObjectURL = () => {}
    return { sent, said }
  }

  it("reads in the agent's cast voice with the reader's bearer, and ends when the audio does", async () => {
    const { sent } = page(() => new Response(new Blob(['mp3'], { type: 'audio/mpeg' })))
    const { speakAgent } = await import('./speech')
    const seen: string[] = []

    speakAgent('**Hello** from the lab.', {
      agent: 'feynman',
      token: 'reader-token',
      onStart: () => seen.push('start'),
      onEnd: () => seen.push('end'),
    })
    await flush()

    expect(sent).toHaveLength(1)
    expect(sent[0].url).toMatch(/\/v1\/audio\/speech$/)
    expect(sent[0].auth).toBe('Bearer reader-token')
    expect(sent[0].body).toMatchObject({ model: 'zen-voice-mini', voice: 'am_puck', input: 'Hello from the lab.' })
    expect(Player.last!.src).toBe('blob:reply')
    expect(Player.last!.paused).toBe(false)
    expect(seen).toEqual(['start'])

    Player.last!.onended!()
    await flush()
    expect(seen).toEqual(['start', 'end'])
    vi.unstubAllGlobals()
  })

  it('stops mid-word on stop, and says so once', async () => {
    page(() => new Response(new Blob(['mp3'], { type: 'audio/mpeg' })))
    const { speakAgent, stopAgentSpeech } = await import('./speech')
    let ended = 0

    speakAgent('A long answer.', { agent: 'dev', token: 't', onEnd: () => ended++ })
    await flush()
    expect(Player.last!.paused).toBe(false)

    stopAgentSpeech()
    await flush()
    expect(Player.last!.paused).toBe(true)
    expect(ended).toBe(1)
    vi.unstubAllGlobals()
  })

  it('lets the browser read when the platform refuses, and reports it', async () => {
    const { said } = page(() => new Response('zen-voice-mini is not available', { status: 400 }))
    const { speakAgent } = await import('./speech')
    const refusals: unknown[] = []
    let ended = false

    speakAgent('Still heard.', { agent: 'einstein', token: 't', onRefusal: (r) => refusals.push(r), onEnd: () => (ended = true) })
    await flush()

    expect(said).toEqual(['Still heard.'])
    expect(refusals).toEqual([expect.objectContaining({ service: 'mouth', covered: true })])
    expect(ended).toBe(true)
    vi.unstubAllGlobals()
  })
})
