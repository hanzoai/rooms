/**
 * WORKSPACE FILES — a dropped file goes to the org's own storage, is indexed
 * there, and is asked about by reference.
 *
 * The bytes never ride a chat request and never pass through the API: a small
 * file is one presigned PUT, a large one a multipart upload whose parts are
 * presigned PUTs straight to Hanzo S3 (resumable — the store keeps the parts it
 * has, and a second attempt sends only the rest). The file then lands in the
 * workspace's Drive bucket, is registered with knowledge (`/v1/knowledge/files`)
 * and indexed in three layers on the platform's durable queue: its table of
 * contents, passages cut inside its sections, and a graph to the other files.
 *
 * A chat turn carries the file's REFERENCE — id, name, type, size — and the
 * passages `retrieve` reads for the question, each citing file › section › ¶n.
 */

import type { HttpClient } from '@hanzo/ai'

/** The HTTP half of an `@hanzo/ai` client: all this module needs. */
export interface Api {
  http: Pick<HttpClient, 'json'>
}

/** A workspace file as knowledge records it. */
export interface WorkFile {
  id: string
  name: string
  type: string
  size: number
  bucket: string
  key: string
  status: 'queued' | 'indexing' | 'ready' | 'stored' | 'failed'
  stage?: 'extract' | 'toc' | 'passages' | 'embed' | 'graph'
  error?: string
  chars?: number
  clipped?: boolean
  sections?: number
  passages?: number
  embedded?: number
  parent?: string
}

/** What a chat message carries of a file: enough to name it and ask about it. */
export interface FileRef {
  id: string
  name: string
  type: string
  size: number
}

export const refOf = (f: Pick<WorkFile, 'id' | 'name' | 'type' | 'size'>): FileRef => ({ id: f.id, name: f.name, type: f.type, size: f.size })

/** A file's ingest has ended, one way or the other. */
export const settled = (f: WorkFile): boolean => f.status === 'ready' || f.status === 'stored' || f.status === 'failed'

/** A file can be asked about: its passages are written, even while it embeds. */
export const askable = (f: WorkFile): boolean =>
  f.status === 'ready' || (f.status === 'indexing' && (f.stage === 'embed' || f.stage === 'graph') && (f.passages ?? 0) > 0)

/** The name a bucket takes from its workspace: a DNS-safe slug, at most 40. */
export const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '') || 'workspace'

const objects = (bucket: string) => `/v1/s3/buckets/${encodeURIComponent(bucket)}`

/**
 * THE WORKSPACE'S BUCKET: the one named for the org, made on first use. Drive
 * opens it by default, so what a chat stores is where Drive looks.
 */
const buckets = new Map<string, Promise<string>>()
export function workspace(api: Api, org: string): Promise<string> {
  const name = slug(org)
  let found = buckets.get(name)
  if (!found) {
    found = (async () => {
      const out = await api.http.json<{ buckets?: { name: string }[] }>({ path: '/v1/s3/buckets' })
      if (!(out?.buckets ?? []).some((b) => b.name === name)) {
        await api.http.json({ method: 'POST', path: '/v1/s3/buckets', body: { name } }).catch((e: unknown) => {
          // Two tabs racing the first upload both try to make it; the loser's 409 is the bucket existing.
          if (!/409|exist/i.test(String((e as Error)?.message ?? e))) throw e
        })
      }
      return name
    })()
    buckets.set(name, found)
    found.catch(() => buckets.delete(name))
  }
  return found
}

/** One PUT of a body to a presigned URL, reporting bytes sent. */
function put(url: string, body: Blob, type: string | undefined, sent: (n: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    if (type) xhr.setRequestHeader('Content-Type', type)
    xhr.upload.onprogress = (e) => sent(e.loaded)
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? (sent(body.size), resolve()) : reject(new Error(`the store answered ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('the upload was interrupted'))
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(body)
  })
}

/** Runs `work` over `items`, at most `n` at a time, and settles when all have. */
export async function pool<T>(items: readonly T[], n: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const lane = async () => {
    while (next < items.length) await work(items[next++])
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, lane))
}

/** Files over this go up in parts. */
export const MULTIPART_AT = 8 * 1024 * 1024

/** How many parts are in flight at once. */
const LANES = 4

const resumeKey = (bucket: string, key: string, file: File) => `hanzo.upload.${bucket}/${key}/${file.size}/${file.lastModified}`

function remembered(k: string): string | null {
  try {
    return window.localStorage.getItem(k)
  } catch {
    return null
  }
}

function remember(k: string, id: string | null): void {
  try {
    if (id) window.localStorage.setItem(k, id)
    else window.localStorage.removeItem(k)
  } catch {
    // A private window keeps no resume point; the upload still goes.
  }
}

/**
 * Uploads a file to bucket/key, reporting the fraction sent. A large file goes
 * in parts; one that was interrupted — a dropped connection, a reload — resumes
 * from the parts the store already holds.
 */
export async function upload(
  api: Api,
  bucket: string,
  key: string,
  file: File,
  progress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const type = file.type || undefined
  if (file.size < MULTIPART_AT) {
    const grant = await api.http.json<{ url: string; method?: string }>({ method: 'POST', path: `${objects(bucket)}/objects`, body: { bucket, key } })
    if (!grant?.url) throw new Error('The store issued no upload address.')
    await put(grant.url, file, type, (n) => progress(file.size ? n / file.size : 1), signal)
    return
  }
  const rk = resumeKey(bucket, key, file)
  // The resume point is the upload id and the part size it was cut at: a part
  // the store holds is only the same part when it is cut at the same size.
  const [had, cut] = (remembered(rk) ?? '').split(' ')
  let upload: string | null = had || null
  let partSize = Number(cut) || 16 * 1024 * 1024
  const done = new Map<number, number>()
  if (upload) {
    try {
      const had = await api.http.json<{ parts: { part: number; size: number }[] }>({
        path: `${objects(bucket)}/uploads/${encodeURIComponent(upload)}`,
        query: { key },
      })
      for (const p of had?.parts ?? []) done.set(p.part, p.size)
    } catch {
      upload = null
    }
  }
  if (!upload) {
    const started = await api.http.json<{ upload: string; partSize: number }>({
      method: 'POST',
      path: `${objects(bucket)}/uploads`,
      body: { bucket, key, type },
    })
    upload = started.upload
    partSize = started.partSize || partSize
    remember(rk, `${upload} ${partSize}`)
  }
  const id = upload
  const count = Math.max(1, Math.ceil(file.size / partSize))
  const sent = new Map<number, number>()
  for (const [n, size] of done) sent.set(n, size)
  const report = () => progress([...sent.values()].reduce((a, b) => a + b, 0) / file.size)
  report()
  const todo: number[] = []
  for (let n = 1; n <= count; n++) {
    const want = Math.min(partSize, file.size - (n - 1) * partSize)
    if (done.get(n) !== want) todo.push(n)
  }
  const urls = new Map<number, string>()
  const mint = async (from: number) => {
    const batch = todo.slice(from, from + 32).filter((n) => !urls.has(n))
    if (!batch.length) return
    const out = await api.http.json<{ urls: { part: number; url: string }[] }>({
      method: 'POST',
      path: `${objects(bucket)}/uploads/${encodeURIComponent(id)}/parts`,
      body: { bucket, upload: id, key, parts: batch },
    })
    for (const u of out?.urls ?? []) urls.set(u.part, u.url)
  }
  let next = 0
  const lane = async () => {
    while (next < todo.length) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      const i = next++
      const n = todo[i]
      if (!urls.has(n)) await mint(i)
      const body = file.slice((n - 1) * partSize, Math.min(file.size, n * partSize))
      for (let attempt = 0; ; attempt++) {
        try {
          await put(urls.get(n)!, body, undefined, (b) => (sent.set(n, b), report()), signal)
          break
        } catch (e) {
          if ((e as Error)?.name === 'AbortError' || attempt === 3) throw e
          // A URL minted minutes ago may have expired: mint the part again.
          urls.delete(n)
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
          await mint(i)
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(LANES, todo.length || 1) }, lane))
  await api.http.json({
    method: 'POST',
    path: `${objects(bucket)}/uploads/${encodeURIComponent(id)}/complete`,
    body: { bucket, upload: id, key },
  })
  remember(rk, null)
}

/** Registers an uploaded object as a workspace file and queues its ingest. */
export const register = (api: Api, bucket: string, key: string): Promise<WorkFile> =>
  api.http.json<WorkFile>({ method: 'POST', path: '/v1/knowledge/files', body: { bucket, key } })

/** One file's record, with how far its ingest has got. */
export const fileOf = (api: Api, id: string): Promise<WorkFile> =>
  api.http.json<WorkFile>({ path: `/v1/knowledge/files/${encodeURIComponent(id)}` })

/** The files of one bucket, for Drive's index state. */
export const filesIn = (api: Api, bucket: string): Promise<WorkFile[]> =>
  api.http
    .json<{ files?: WorkFile[] }>({ path: '/v1/knowledge/files', query: { bucket, limit: 1000 } })
    .then((out) => out?.files ?? [])

/** Removes a file from the index; the object stays where it is. */
export const forget = (api: Api, id: string): Promise<unknown> =>
  api.http.json({ method: 'DELETE', path: `/v1/knowledge/files/${encodeURIComponent(id)}` })

/**
 * Polls a file until its ingest settles, calling `seen` with each new record.
 * Answers the last record; stops early when `signal` aborts.
 */
export async function follow(api: Api, id: string, seen: (f: WorkFile) => void, signal?: AbortSignal): Promise<WorkFile> {
  let wait = 800
  for (;;) {
    const f = await fileOf(api, id)
    seen(f)
    if (settled(f) || signal?.aborted) return f
    await new Promise((r) => setTimeout(r, wait))
    wait = Math.min(wait * 1.4, 5000)
  }
}

/**
 * Waits, at most `ms`, for each file to have passages to read or to settle,
 * and answers what the index last said of each.
 */
export async function readable(api: Api, list: readonly WorkFile[], ms: number): Promise<WorkFile[]> {
  const until = Date.now() + ms
  let now = list.slice()
  while (Date.now() < until && now.some((f) => !askable(f) && !settled(f))) {
    await new Promise((r) => setTimeout(r, 1200))
    now = await Promise.all(now.map((f) => (askable(f) || settled(f) ? f : fileOf(api, f.id).catch(() => f))))
  }
  return now
}

/** Where a file is under a key: the chat's folder, with a dropped folder's own path kept. */
export const chatKey = (file: File): string => {
  const rel = (file as File & { webkitRelativePath?: string; relative?: string }).relative || (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
  return `chat/${rel.replace(/^\/+/, '').replace(/\.\.+\//g, '')}`
}

/**
 * Every file in a drop, folders walked: a dropped folder arrives as entries, not
 * files, and each file found under it keeps its path (`relative`).
 */
export async function dropped(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? []).filter((i) => i.kind === 'file')
  const entries = items.map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.() ?? null)
  if (!entries.some((e) => e?.isDirectory)) return Array.from(dt.files ?? [])
  const out: File[] = []
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
      Object.defineProperty(file, 'relative', { value: prefix + file.name })
      out.push(file)
      return
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
      if (!batch.length) break
      for (const child of batch) await walk(child, `${prefix}${entry.name}/`)
    }
  }
  for (const e of entries) if (e) await walk(e, '')
  return out
}

// ---- reading the index back ----

/** One passage, with where it is. */
export interface Passage {
  file: { id: string; name: string; type: string; bucket: string; key: string }
  section: { id: number; title: string; path: string }
  part: number
  text: string
  cite: string
  score: number
  via: 'search' | 'toc' | 'graph'
  why?: string
}

/** What `retrieve` grounds an answer in. */
export interface Grounds {
  sections: { file: Passage['file']; section: Passage['section']; summary?: string }[]
  passages: Passage[]
  picked: 'model' | 'search'
  degraded?: boolean
}

/** ToC-first retrieval: the sections a model picks from the files' tables of contents, their passages, and the graph's. */
export const retrieve = (api: Api, query: string, files: string[], limit = 8): Promise<Grounds> =>
  api.http.json<Grounds>({ method: 'POST', path: '/v1/knowledge/files/retrieve', body: { query, files, limit } })

/** Passages of the org's files that match, for Drive's search. */
export const search = (api: Api, query: string, limit = 12): Promise<{ passages: Passage[] }> =>
  api.http.json<{ passages: Passage[] }>({ method: 'POST', path: '/v1/knowledge/files/search', body: { query, limit } })

/** One node of a file's table of contents. */
export interface TocEntry {
  id: number
  parent: number
  level: number
  title: string
  summary?: string
  size: number
  synthetic?: boolean
}

export const toc = (api: Api, id: string): Promise<{ file: WorkFile; sections: TocEntry[] }> =>
  api.http.json({ path: `/v1/knowledge/files/${encodeURIComponent(id)}/toc` })

/** One section, opened. */
export interface Opened {
  file: Passage['file']
  section: Passage['section']
  summary?: string
  text: string
  children: TocEntry[]
  links: { file: Passage['file']; section: Passage['section']; kind: string; label: string }[]
  entities: { name: string; kind: string; files: number }[]
}

export const section = (api: Api, id: string, n: number): Promise<Opened> =>
  api.http.json({ path: `/v1/knowledge/files/${encodeURIComponent(id)}/sections/${n}` })

/** A signed download address for a file's bytes. */
export const download = (api: Api, bucket: string, key: string): Promise<string> =>
  api.http
    .json<{ url: string }>({ path: `${objects(bucket)}/objects/${key.split('/').map(encodeURIComponent).join('/')}` })
    .then((g) => g.url)
