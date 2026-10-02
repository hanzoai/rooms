/**
 * Files that go with a chat message.
 *
 * @hanzo/ai's `send(text, images)` carries a picture as an `image_url` part the
 * model reads, and nothing else rides that wire, so a file goes one of two
 * ways: an image as a `data:` URI beside the words, a text file as its own
 * words after the message, fenced under its name. Any other kind is refused by
 * name, before anything is sent.
 */

import type { MessagePart } from '@hanzo/ui/chat'

/** A file held for the next message. */
export interface Held {
  id: string
  name: string
  kind: 'image' | 'text'
  /** A `data:` URI for an image, the words for a text file. */
  data: string
  size: number
}

export const IMAGE_MAX = 8 * 1024 * 1024
export const TEXT_MAX = 256 * 1024

const TEXT_TYPE = /^(text\/|application\/(json|ld\+json|xml|x-yaml|yaml|toml|javascript|typescript|x-sh|sql|x-tex))/
const TEXT_NAME =
  /\.(md|mdx|txt|csv|tsv|json|jsonl|ya?ml|toml|xml|html?|css|scss|[cm]?[jt]sx?|py|go|rs|rb|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|bash|zsh|sql|ini|env|log|tex|proto|graphql)$/i

/** Which way a file goes with a message, or null when it cannot go. */
export function kindOf(file: { name: string; type: string }): Held['kind'] | null {
  if (file.type.startsWith('image/')) return 'image'
  if (TEXT_TYPE.test(file.type) || TEXT_NAME.test(file.name)) return 'text'
  return null
}

function read(file: File, as: 'url' | 'text'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error(`${file.name} could not be read.`))
    if (as === 'url') reader.readAsDataURL(file)
    else reader.readAsText(file)
  })
}

/** A file read and held, or the sentence that says why it cannot go. */
export async function hold(file: File): Promise<Held | string> {
  const kind = kindOf(file)
  if (!kind) return `${file.name}: only images and text files go with a message.`
  const max = kind === 'image' ? IMAGE_MAX : TEXT_MAX
  if (file.size > max) return `${file.name} is larger than ${kind === 'image' ? '8 MB' : '256 KB'}.`
  try {
    const data = await read(file, kind === 'image' ? 'url' : 'text')
    return { id: crypto.randomUUID(), name: file.name, kind, data, size: file.size }
  } catch {
    return `${file.name} could not be read.`
  }
}

/** A fence longer than any run of backticks inside the words, so they cannot close it. */
function fence(words: string): string {
  const longest = Math.max(0, ...(words.match(/`+/g) ?? []).map((run) => run.length))
  return '`'.repeat(Math.max(3, longest + 1))
}

/**
 * The message as sent: the words, then each text file fenced under its name.
 * With no words and no text file, the images' names, so the turn says what it
 * carries.
 */
export function compose(text: string, files: readonly Held[]): string {
  const blocks = files
    .filter((f) => f.kind === 'text')
    .map((f) => {
      const f3 = fence(f.data)
      return `${f.name}\n${f3}\n${f.data.replace(/\n$/, '')}\n${f3}`
    })
  const out = [text.trim(), ...blocks].filter(Boolean).join('\n\n')
  return out || files.map((f) => f.name).join(', ')
}

/** The images of a message, as the URIs @hanzo/ai's `send` takes. */
export const images = (files: readonly Held[]): string[] => files.filter((f) => f.kind === 'image').map((f) => f.data)

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
