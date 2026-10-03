/**
 * Files that go with a chat message — by REFERENCE.
 *
 * A file put into a conversation is uploaded to the org's workspace and indexed
 * there (`lib/files`). The turn carries what NAMES it — id, name, type, size —
 * and the passages read from it for the question, each citing
 * file › section › ¶n. No byte of the file rides the chat request, so there is
 * no size a file must stay under to go with a message.
 *
 * The names and the passages travel in one block after the words. The block is
 * what the model reads; `said` takes it back off for drawing, so a person sees
 * their words and the files' chips, never the passages.
 */

import type { MessagePart } from '@hanzo/ui/chat'
import type { FileRef, Grounds } from './files'

const OPEN = '<workspace-files>'
const CLOSE = '</workspace-files>'

/** The files a turn reads: those put into it, and those carried from earlier turns. */
export interface Carried {
  attached: FileRef[]
  reused: FileRef[]
}

/** A size as a person reads it. */
export function weigh(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let n = bytes / 1024
  let u = 0
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u++
  }
  return `${n >= 10 ? Math.round(n) : n.toFixed(1)} ${units[u]}`
}

/** Text that cannot close the block it sits in. */
const inert = (s: string): string => s.split(CLOSE).join('</workspace files>')

/**
 * The message as sent: the words, then one block naming the files and holding
 * what was read from them for this question.
 *
 * `why` says why there are no passages, when there are none — still indexing,
 * stored without indexing, or the read failed — so the model says so rather
 * than answering as though it had read the files.
 */
export function compose(text: string, carried: Carried, grounds: Grounds | null, why?: string, partial?: string): string {
  const words = text.trim()
  const all = [...carried.attached, ...carried.reused]
  if (!all.length) return words
  const passages = grounds?.passages ?? []
  const lines = [
    OPEN,
    JSON.stringify({ attached: carried.attached, reused: carried.reused }),
    `The person's workspace holds these files: ${all.map((f) => `${f.name} (${f.type || 'file'}, ${weigh(f.size)})`).join('; ')}.`,
  ]
  if (partial) lines.push(`Not all of every file was indexed (${inert(partial)}): if the answer may lie past that, say so.`)
  if (passages.length) {
    lines.push(
      words
        ? 'Answer from the passages below, read from those files for this question. Cite each claim with its number, like [1], and end with a Sources list giving each passage you cited as "[n] file › section › ¶n". If the passages do not answer the question, say what is missing.'
        : 'The person sent these files without a question: say what each one is and what it covers, from the passages below, citing them like [1].',
    )
    passages.forEach((p, i) => {
      lines.push('', `[${i + 1}] ${inert(p.cite)}`, inert(p.text.trim()))
    })
  } else {
    lines.push(`No passages could be read from them${why ? ` (${why})` : ''}: say so, and answer only what you can without them.`)
  }
  lines.push(CLOSE)
  const block = lines.join('\n')
  return words ? `${words}\n\n${block}` : block
}

/** A turn read back: the words a person wrote, and the files it carried. */
export interface Said {
  text: string
  carried: Carried | null
  /** The citations the turn handed the model, numbered as it numbered them. */
  cites: string[]
}

/** Takes the files block back off a turn, for drawing. */
export function said(content: string): Said {
  const at = content.startsWith(`${OPEN}\n`) ? 0 : content.lastIndexOf(`\n${OPEN}\n`)
  if (at < 0) return { text: content, carried: null, cites: [] }
  const start = content.indexOf(OPEN, at) + OPEN.length + 1
  const end = content.indexOf(CLOSE, start)
  const body = content.slice(start, end < 0 ? undefined : end)
  const nl = body.indexOf('\n')
  try {
    const head = JSON.parse(nl < 0 ? body : body.slice(0, nl)) as Partial<Carried>
    const carried: Carried = {
      attached: Array.isArray(head.attached) ? head.attached.filter(isRef) : [],
      reused: Array.isArray(head.reused) ? head.reused.filter(isRef) : [],
    }
    const cites = [...body.matchAll(/^\[(\d+)\] (.+)$/gm)].map((m) => m[2])
    return { text: content.slice(0, at).trimEnd(), carried, cites }
  } catch {
    return { text: content, carried: null, cites: [] }
  }
}

function isRef(v: unknown): v is FileRef {
  const r = v as FileRef
  return !!r && typeof r.id === 'string' && typeof r.name === 'string'
}

/**
 * Every file the conversation's turns have carried, once each, oldest first —
 * what a later question in the same conversation reads again.
 */
export function carriedIn(turns: readonly { role: string; content?: unknown }[]): FileRef[] {
  const out = new Map<string, FileRef>()
  for (const t of turns) {
    if (t.role !== 'user' || typeof t.content !== 'string') continue
    const c = said(t.content).carried
    for (const f of [...(c?.attached ?? []), ...(c?.reused ?? [])]) if (!out.has(f.id)) out.set(f.id, f)
  }
  return [...out.values()]
}

/** A wire turn's parts — text and `image_url` — as the parts `@hanzo/ui/chat` draws. */
export function partsOf(content: readonly unknown[]): MessagePart[] {
  const out: MessagePart[] = []
  for (const one of content) {
    const part = one as { type?: string; text?: string; image_url?: { url?: string } }
    if (part?.type === 'text' && part.text) out.push({ type: 'text', text: part.text })
    else if (part?.type === 'image_url' && part.image_url?.url) out.push({ type: 'image', url: part.image_url.url, alt: 'Attached image' })
  }
  return out
}
