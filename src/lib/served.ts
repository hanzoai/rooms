/**
 * WHICH MODEL ANSWERED A TURN, as the gateway says it.
 *
 * The gateway may answer a pinned model from another when a provider refuses,
 * and it names the one that answered twice: the `X-Hanzo-Served` header and
 * the `model` field of the reply's own frames. `@hanzo/ai` 0.6.16 reads
 * neither, so the site's client is built on `observed(fetch)`, which reads
 * them off each completion as it passes and tells the listeners — the header
 * when the gateway exposes it, else the first frame that names a model. Every
 * byte is passed through untouched.
 */

/** A completion's asked and answering models. */
export interface Served {
  asked: string
  served: string
}

const listeners = new Set<(heard: Served) => void>()

/** Hears every served completion from now on; answers the unsubscribe. */
export function onServed(listener: (heard: Served) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const tell = (heard: Served) => {
  for (const listener of listeners) listener(heard)
}

/** The completion route, whatever host the client was built for. */
const COMPLETION = /\/v1\/chat\/completions(?:[?#]|$)/

/** A fetch that tells `onServed` listeners which model answered each completion. */
export function observed(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const res = await base(input, init)
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!COMPLETION.test(url) || !res.ok) return res
    let asked = ''
    try {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
      if (typeof body?.model === 'string') asked = body.model
    } catch {
      /* a body that is not JSON names no model */
    }
    const header = res.headers.get('x-hanzo-served')
    if (header) {
      tell({ asked, served: header })
      return res
    }
    if (!res.body || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      res
        .clone()
        .json()
        .then((d: { model?: unknown }) => {
          if (typeof d?.model === 'string' && d.model) tell({ asked, served: d.model })
        })
        .catch(() => {})
      return res
    }
    const decoder = new TextDecoder()
    let heard = false
    let carry = ''
    const watch = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, out) {
        out.enqueue(chunk)
        if (heard) return
        carry += decoder.decode(chunk, { stream: true })
        let at = carry.indexOf('\n')
        while (!heard && at >= 0) {
          const line = carry.slice(0, at).trim()
          carry = carry.slice(at + 1)
          at = carry.indexOf('\n')
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data || data === '[DONE]') continue
          try {
            const frame = JSON.parse(data) as { model?: unknown }
            if (typeof frame.model === 'string' && frame.model) {
              heard = true
              tell({ asked, served: frame.model })
            }
          } catch {
            /* a frame split across chunks is read whole on the next line */
          }
        }
      },
    })
    return new Response(res.body.pipeThrough(watch), { status: res.status, statusText: res.statusText, headers: res.headers })
  }
}
