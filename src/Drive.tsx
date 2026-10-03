'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  Download,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderInput,
  FolderPlus,
  HardDrive,
  ListTree,
  MessageSquare,
  LayoutGrid,
  List,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { Box, Button, Text, View, XStack, YStack } from '@hanzo/ui'
import { useIam, useOrganizations } from '@hanzo/iam/react'
import { useAi } from './lib/ai'
import { empty, useOpen } from './open'
import { attach, channel } from './pane'
import { useRooms } from './host'
import { Badge, Contents, Hits } from './Contents'
import { weigh as size } from './lib/attach'
import {
  dropped,
  filesIn,
  forget,
  pool,
  register,
  search,
  settled,
  slug,
  upload,
  type Passage,
  type WorkFile,
} from './lib/files'
import { checkoutUrl } from './lib/pay'
import { BAD, mix } from './lib/mix'

interface Bucket {
  name: string
  /** The store's own label for it, when it has one. */
  displayName?: string
  createdAt: number
}

interface Entry {
  /** Relative to the prefix that was listed, so it is already the display name. */
  key: string
  isDir: boolean
  size: number
  lastModified: number
  type?: string
}

type Client = NonNullable<ReturnType<typeof useAi>['client']>

/** A project as `/v1/projects` answers it — the fields this pane reads. */
interface Project {
  id: string
  name?: string
  slug?: string
  framework?: string
  createdAt?: number
  updatedAt?: number
}

const blame = (e: unknown): string => {
  const text = e instanceof Error ? e.message : String(e ?? '')
  return text || 'The store did not say what went wrong.'
}

/** A size as a row shows it; nothing is a dash. */
const weigh = (bytes: number): string => (bytes ? size(bytes) : '—')

/** Format timestamp */
const when = (stamp: number): string => {
  if (!stamp) return ''
  const ms = stamp < 1e12 ? stamp * 1000 : stamp
  const d = new Date(ms)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' })
}

/** The store publishes a bucket's own display name; the slug is the fallback. */
const getBucketDisplayName = (b: Bucket | string | undefined): string =>
  (typeof b === 'string' ? b : b?.displayName || b?.name) || 'Drive'

const wire = (key: string): string => key.split('/').map(encodeURIComponent).join('/')
const objects = (bucket: string): string => `/v1/s3/buckets/${encodeURIComponent(bucket)}/objects`

async function putBytes(client: Client, bucket: string, key: string, body: Blob, type?: string): Promise<void> {
  const grant = await client.http.json<{ url: string; method?: string }>({
    method: 'POST',
    path: objects(bucket),
    body: { bucket, key },
  })
  if (!grant?.url) throw new Error('The store issued no upload address.')
  const sent = await fetch(grant.url, {
    method: grant.method || 'PUT',
    body,
    headers: type ? { 'Content-Type': type } : undefined,
  })
  if (!sent.ok) throw new Error(`${key.split('/').pop()} did not upload (${sent.status}).`)
}

async function urlFor(client: Client, bucket: string, key: string): Promise<string> {
  const grant = await client.http.json<{ url: string }>({ path: `${objects(bucket)}/${wire(key)}` })
  if (!grant?.url) throw new Error('The store issued no download address.')
  return grant.url
}

async function remove(client: Client, bucket: string, key: string): Promise<void> {
  await client.http.json({ method: 'DELETE', path: `${objects(bucket)}/${wire(key)}` })
}

function Glyph({ entry, size = 16 }: { entry: Entry; size?: number }) {
  if (entry.isDir) return <Folder size={size} color="var(--foreground)" aria-hidden />
  const ext = (entry.key.split('.').pop() || '').toLowerCase()
  if (/^(png|jpe?g|gif|webp|svg|heic|avif|bmp)$/.test(ext)) return <FileImage size={size} color="var(--muted-foreground)" aria-hidden />
  if (/^(mp4|mov|webm|mkv|avi)$/.test(ext)) return <FileVideo size={size} color="var(--muted-foreground)" aria-hidden />
  if (/^(mp3|wav|m4a|flac|ogg|aac)$/.test(ext)) return <FileAudio size={size} color="var(--muted-foreground)" aria-hidden />
  if (/^(zip|tar|gz|tgz|7z|rar|bz2|xz)$/.test(ext)) return <FileArchive size={size} color="var(--muted-foreground)" aria-hidden />
  if (/^(md|txt|rtf|doc|docx|pdf|csv|xls|xlsx|ppt|pptx)$/.test(ext)) return <FileText size={size} color="var(--muted-foreground)" aria-hidden />
  if (/^(ts|tsx|js|jsx|py|go|rs|rb|java|kt|swift|c|h|cpp|cs|sh|json|ya?ml|toml|html|css|sql)$/.test(ext))
    return <FileCode size={size} color="var(--muted-foreground)" aria-hidden />
  return <FileIcon size={size} color="var(--muted-foreground)" aria-hidden />
}

/** The tables' column templates, header and rows alike. */
const FILES = 'minmax(200px, 2fr) 120px 140px 100px 48px'
const PROJECTS = 'minmax(220px, 2fr) 120px 140px 100px 48px'

/** A column heading. */
const HEAD = { fontSize: '$1', fontWeight: '600', color: '$faint', letterSpacing: 0.6, textTransform: 'uppercase' } as const
/** A row's name: one line, cut with an ellipsis. */
const NAME = { fontSize: '$2', fontWeight: '500', color: '$ink', numberOfLines: 1 } as const
/** A row's kind, set as a tag. */
const CHIP = { fontSize: '$1', color: '$soft', bg: '$hover', px: 8, py: 2, rounded: 4 } as const
/** A quiet cell: the date and the size. */
const CELL = { fontSize: '$2', color: '$soft' } as const

/** A row's "more" control. */
function More({ onPress }: { onPress: (e: { stopPropagation: () => void }) => void }) {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onPress} aria-label="More" title="More">
      <MoreHorizontal size={15} />
    </Button>
  )
}

/** One line of a row's menu: a glyph and a word, the whole width. */
function Pick({
  icon: Icon,
  label,
  tone,
  onPress,
}: {
  icon: typeof Download
  label: string
  tone?: `var(--${string})`
  onPress: () => void
}) {
  return (
    <Button variant="ghost" size="sm" width="100%" justify="flex-start" {...(tone ? { color: tone } : null)} onClick={onPress}>
      <Icon size={13} />
      {label}
    </Button>
  )
}

/** A tooltip on a gui element: `title` is a DOM attribute gui passes through and does not type. */
const tip = (title: string) => ({ title }) as object
/** A field with no chrome of its own, inside a box that draws it. */
const BARE = { flex: 1, bg: 'transparent', borderWidth: 0, outlineStyle: 'none', color: '$ink', fontSize: '$2' } as const
/** One line of the New menu. */
const ITEM = { variant: 'ghost', size: 'sm', width: '100%', justify: 'flex-start' } as const
/** A step of the breadcrumb: a link-styled Button; its ink says whether it is where you are. */
const CRUMB = { variant: 'link', size: 'sm', px: 0, fontWeight: '600' } as const
/** The buckets list's one line when it has no rows to show. */
const NOTE = { display: 'block', px: 16, py: 24, fontSize: '$2', color: '$faint', text: 'center' } as const
/** The drop target's veil: the page's own ground, nearly opaque. */
const VEIL = mix('var(--background)', 90, 'srgb')

// The sections the store can actually answer. `shared`, `starred` and `trash`
// were drawn too, and the object store has no such concept — three doors onto
// the same listing, which is worse than three fewer doors.
type NavSection = 'my-drive' | 'recent'
type ViewMode = 'list' | 'grid' | 'details'

export function Drive() {
  const { client } = useAi()
  const { user, isAuthenticated } = useIam()
  const ready = Boolean(client && isAuthenticated)
  const { bucket, openBucket, room } = useOpen()
  const { router } = useRooms()
  const { currentOrg } = useOrganizations()
  const workspace = currentOrg?.displayName || currentOrg?.name || 'hanzo'
  // THE WORKSPACE'S BUCKET is the one named for the org: where a file put into a
  // chat lands (lib/files `workspace`), so it is where Drive opens.
  const home = currentOrg?.name ? slug(currentOrg.name) : null

  const [navSection, setNavSection] = useState<NavSection>('my-drive')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [searchQuery, setSearchQuery] = useState('')

  const [buckets, setBuckets] = useState<Bucket[] | null>(null)
  const [reload, setReload] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [prefix, setPrefix] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  // Below md the side column is a drawer over the files, opened from the bar.
  const [menu, setMenu] = useState(false)
  const [itemMenuKey, setItemMenuKey] = useState<string | null>(null)
  const [naming, setNaming] = useState<{ kind: 'folder' | 'rename'; key?: string; value: string } | null>(null)
  const [projects, setProjects] = useState<Project[] | null>(null)
  // What the drive actually holds, measured. There is no quota route, so there
  // is no quota drawn: a number nobody publishes would be a number invented.
  const [usage, setUsage] = useState<{ bytes: number; files: number; capped: boolean } | null>(null)
  // WHAT THE INDEX SAYS of each object in the open bucket, by key: queued,
  // indexing (and which stage), ready, kept-not-indexed or failed.
  const [index, setIndex] = useState<Map<string, WorkFile>>(() => new Map())
  // A search's passages, and the file whose contents are open beside the list.
  const [hits, setHits] = useState<Passage[] | null>(null)
  const [contents, setContents] = useState<{ file: WorkFile; at?: number } | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const dragCounter = useRef(0)

  // PROJECTS are the org's own, from the platform. `/v1/projects` answers every
  // project this org owns; nothing stands in for it when it answers nothing.
  useEffect(() => {
    if (!ready || !client) return
    let live = true
    client.http
      .json<Project[]>({ path: '/v1/projects' })
      .then((ps) => live && setProjects(Array.isArray(ps) ? ps : []))
      .catch(() => live && setProjects([]))
    return () => {
      live = false
    }
  }, [ready, client])

  // BUCKETS. Through the client, which carries the caller's IAM token and the
  // API's own origin — a relative fetch reaches this site, not the platform,
  // and answers HTML that JSON.parse then throws on.
  useEffect(() => {
    if (!ready || !client) {
      setBuckets(null)
      return
    }
    let live = true
    client.http
      .json<{ buckets?: Bucket[] }>({ path: '/v1/s3/buckets' })
      .then((out) => live && setBuckets(out?.buckets ?? []))
      .catch((e) => live && setFailed(blame(e)))
    return () => {
      live = false
    }
  }, [ready, client, reload])

  // THE DRIVE IS A BUCKET THE ORG OWNS. It used to fall back to the literal
  // "my-drive", which is a nav label rather than a name the store answers to —
  // so every read 404'd and every write went nowhere.
  const landing = (home && buckets?.some((b) => b.name === home) ? home : buckets?.[0]?.name) || null
  const activeBucket = bucket || landing

  // YOU LAND IN THE DRIVE, not in a chooser. The root view lists buckets and
  // projects, and the toolbar's verbs all act on an OPEN bucket — so opening
  // the org's first one is what makes New, upload and the listing agree about
  // where they are. It is also what a drive does: the files, on arrival.
  useEffect(() => {
    if (!bucket && landing) openBucket(landing)
  }, [bucket, landing, openBucket])

  // THE INDEX'S WORD on this bucket's files, read again every few seconds while
  // any of them is still moving through its stages.
  useEffect(() => {
    if (!ready || !client || !activeBucket) {
      setIndex(new Map())
      return
    }
    let live = true
    let clock: ReturnType<typeof setTimeout> | undefined
    const pass = () =>
      filesIn(client, activeBucket)
        .then((list) => {
          if (!live) return
          setIndex(new Map(list.map((f) => [f.key, f])))
          if (list.some((f) => !settled(f))) clock = setTimeout(pass, 4000)
        })
        .catch(() => {})
    void pass()
    return () => {
      live = false
      if (clock) clearTimeout(clock)
    }
  }, [ready, client, activeBucket, reload])

  // SEARCH READS THE FILES, not just their names: three characters or more ask
  // the index for the passages that match, beside the name filter.
  useEffect(() => {
    const q = searchQuery.trim()
    if (!ready || !client || q.length < 3) {
      setHits(null)
      return
    }
    let live = true
    const clock = setTimeout(() => {
      search(client, q, 12)
        .then((out) => live && setHits(out.passages ?? []))
        .catch(() => live && setHits([]))
    }, 400)
    return () => {
      live = false
      clearTimeout(clock)
    }
  }, [ready, client, searchQuery])

  /** Opens a file's contents beside the list, at a section when one is named. */
  const showContents = useCallback(
    (id: string, at?: number) => {
      const known = [...index.values()].find((f) => f.id === id)
      if (known) return setContents({ file: known, at })
      if (!client) return
      void client.http
        .json<WorkFile>({ path: `/v1/knowledge/files/${encodeURIComponent(id)}` })
        .then((f) => setContents({ file: f, at }))
        .catch((e) => setFailed(blame(e)))
    },
    [index, client],
  )

  /** ASK IN CHAT: a new conversation with the file put into it, by reference. */
  const askInChat = useCallback(
    (f: WorkFile) => {
      if (!client) return
      empty()
      attach(channel({ room, thread: null, agent: null }), [f], { api: client, org: currentOrg?.name ?? null })
      router.push('/chat')
    },
    [client, room, currentOrg, router],
  )

  // WHAT IS AT THIS LEVEL. The store's listing takes `recursive`; passing
  // `delimiter` (S3's own word) is silently ignored, so a flat listing came
  // back and every folder read as a file.
  const loadEntries = useCallback(() => {
    if (!ready || !client || !activeBucket) {
      setEntries(null)
      return
    }
    let live = true
    client.http
      .collection<Entry>('objects', { path: objects(activeBucket), query: { prefix } })
      .then((found) => live && setEntries(found))
      .catch((e) => live && setFailed(blame(e)))
    return () => {
      live = false
    }
  }, [ready, client, activeBucket, prefix])

  useEffect(() => {
    loadEntries()
  }, [loadEntries, reload])

  // WHAT IT WEIGHS, measured rather than quoted: every object under the bucket,
  // summed. The listing is bounded by the platform, so a bucket past that cap
  // reports what was counted and says it is a floor.
  useEffect(() => {
    if (!ready || !client || !activeBucket) {
      setUsage(null)
      return
    }
    let live = true
    client.http
      .json<{ objects?: Entry[]; total?: number }>({ path: objects(activeBucket), query: { recursive: 'true' } })
      .then((out) => {
        if (!live) return
        const all = (out?.objects ?? []).filter((e) => !e.isDir)
        setUsage({
          bytes: all.reduce((n, e) => n + (e.size || 0), 0),
          files: all.length,
          capped: typeof out?.total === 'number' && out.total > all.length,
        })
      })
      .catch(() => live && setUsage(null))
    return () => {
      live = false
    }
  }, [ready, client, activeBucket, reload])

  /** One verb: say what is happening, re-read when it lands, blame when it does not. */
  const run = useCallback(
    async (note: string, work: (say: (s: string) => void) => Promise<void>) => {
      if (!client || !activeBucket || busy) return
      setBusy(note)
      setFailed(null)
      try {
        await work(setBusy)
        setReload((n) => n + 1)
      } catch (e) {
        setFailed(blame(e))
      } finally {
        setBusy(null)
      }
    },
    [client, activeBucket, busy],
  )

  // UPLOAD skips the platform: the bytes go straight to the store through
  // presigned PUTs — one for a small file, one per 16 MB part for a large one,
  // resumed from the parts the store holds when a connection drops — several
  // files at once. Each lands as a workspace file: registered with the index,
  // which reads it into contents, passages and links.
  const handleUpload = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return
      const list = Array.from(files)
      if (!list.length || !client || !activeBucket) return
      void run(`Uploading ${list.length === 1 ? list[0].name : `${list.length} files`}`, async (say) => {
        const sent = new Map<File, number>()
        const total = list.reduce((n, f) => n + f.size, 0) || 1
        const tell = () => say(`Uploading ${list.length === 1 ? list[0].name : `${list.length} files`} — ${Math.floor(([...sent.values()].reduce((a, b) => a + b, 0) / total) * 100)}%`)
        await pool(list, 3, async (file) => {
          const f = file as File & { webkitRelativePath?: string; relative?: string }
          const key = `${prefix}${f.relative || f.webkitRelativePath || file.name}`
          await upload(client, activeBucket, key, file, (fraction) => {
            sent.set(file, fraction * file.size)
            tell()
          })
          await register(client, activeBucket, key)
        })
      })
    },
    [client, activeBucket, prefix, run],
  )

  const handleCreateFolder = useCallback(
    (folderName: string) => {
      const clean = folderName.trim().replace(/^\/+|\/+$/g, '')
      if (!clean || !client || !activeBucket) return
      void run(`Creating ${clean}`, () => putBytes(client, activeBucket, `${prefix}${clean}/`, new Blob([])))
      setNaming(null)
    },
    [client, activeBucket, prefix, run],
  )

  const handleRename = useCallback(
    (entry: Entry, to: string) => {
      const clean = to.trim().replace(/^\/+|\/+$/g, '')
      if (!clean || !client || !activeBucket || entry.isDir) return
      const from = `${prefix}${entry.key}`
      // The store has no copy, so a rename is the three verbs it does have.
      void run(`Renaming ${entry.key}`, async () => {
        const src = await fetch(await urlFor(client, activeBucket, from))
        if (!src.ok) throw new Error(`${entry.key} could not be read (${src.status}).`)
        const body = await src.blob()
        await putBytes(client, activeBucket, `${prefix}${clean}`, body, body.type || undefined)
        await remove(client, activeBucket, from)
      })
      setNaming(null)
    },
    [client, activeBucket, prefix, run],
  )

  const handleDelete = useCallback(
    (entry: Entry) => {
      if (!client || !activeBucket) return
      const key = `${prefix}${entry.key}`
      // A deleted file leaves the index too, so search and chat stop citing it.
      const unindex = async (k: string) => {
        const f = index.get(k)
        if (f) await forget(client, f.id).catch(() => {})
      }
      void run(`Deleting ${entry.key}`, async (say) => {
        if (!entry.isDir) {
          await remove(client, activeBucket, key)
          return unindex(key)
        }
        const root = key.endsWith('/') ? key : `${key}/`
        const out = await client.http.json<{ objects?: Entry[] }>({ path: objects(activeBucket), query: { prefix: root, recursive: 'true' } })
        for (const e of (out?.objects ?? []).filter((x) => !x.isDir)) {
          say(`Deleting ${e.key}`)
          await remove(client, activeBucket, root + e.key)
          await unindex(root + e.key)
        }
        await remove(client, activeBucket, root).catch(() => {})
      })
    },
    [client, activeBucket, prefix, run, index],
  )

  // DOWNLOAD follows a presigned GET. The object's platform address answers a
  // signed URL, not the bytes, and it needs the caller's token — which an
  // anchor href does not carry.
  const handleDownload = useCallback(
    (entry: Entry) => {
      if (!client || !activeBucket || entry.isDir) return
      void run(`Fetching ${entry.key}`, async () => {
        const url = await urlFor(client, activeBucket, `${prefix}${entry.key}`)
        const a = document.createElement('a')
        a.href = url
        a.download = entry.key.split('/').pop() || 'download'
        a.rel = 'noreferrer'
        a.target = '_blank'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      })
    },
    [client, activeBucket, prefix, run],
  )

  const allProjects = useMemo(
    () =>
      (projects ?? []).map((p) => ({
        id: p.id || p.slug || p.name,
        name: p.name || p.slug || p.id,
        type: p.framework || 'Project',
        updated: when(p.updatedAt || p.createdAt || 0),
        size: '—',
      })),
    [projects],
  )

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return allProjects
    const q = searchQuery.toLowerCase()
    return allProjects.filter((p) => p.name.toLowerCase().includes(q))
  }, [allProjects, searchQuery])

  const filteredEntries = useMemo(() => {
    if (!entries) return null
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter((e) => e.key.toLowerCase().includes(q))
  }, [entries, searchQuery])

  // Breadcrumbs
  const crumbs = useMemo(() => {
    if (!prefix) return []
    return prefix.replace(/\/+$/, '').split('/')
  }, [prefix])

  const userEmail = user?.email || ''
  const userInitials = (user?.displayName || user?.name || userEmail)
    .slice(0, 1)
    .toUpperCase()

  return (
    <YStack
      flex={1}
      height="100%"
      bg="$background"
      position="relative"
      onDragEnter={(e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current += 1
        setOver(true)
      }}
      onDragLeave={(e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current -= 1
        if (dragCounter.current <= 0) {
          dragCounter.current = 0
          setOver(false)
        }
      }}
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'copy'
        setOver(true)
      }}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current = 0
        setOver(false)
        if (e.dataTransfer.files?.length) void dropped(e.dataTransfer).then(handleUpload)
      }}
    >
      {/* Hidden file inputs for picker */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          handleUpload(e.target.files)
          e.currentTarget.value = ''
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error directory support
        webkitdirectory="true"
        directory="true"
        multiple
        hidden
        onChange={(e) => {
          handleUpload(e.target.files)
          e.currentTarget.value = ''
        }}
      />

      {/* Top Header Bar */}
      <XStack
        height={56}
        items="center"
        justify="space-between"
        px="$5"
        borderBottomWidth={1}
        borderColor="$borderColor"
        shrink={0}
      >
        {/* On a phone the side column folds into a drawer, and this opens it. */}
        <XStack width={220} shrink={1}>
          <View display="none" $max-md={{ display: 'flex' }}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMenu((v) => !v)}
              aria-label="Drive menu"
              aria-expanded={menu}
              aria-controls="drive-menu"
              title="Drive menu"
            >
              <PanelLeft size={16} />
            </Button>
          </View>
        </XStack>

        {/* Centered Search Bar */}
        <XStack
          items="center"
          gap="$2"
          width={460}
          maxW="45%"
          height={38}
          px="$3"
          rounded={8}
          bg="$panel"
          borderWidth={1}
          borderColor="var(--border-control)"
        >
          <Search size={15} color="var(--muted-foreground)" aria-hidden />
          <Text
            render={<input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search Drive" aria-label="Search Drive" />}
            {...BARE}
          />
        </XStack>

        {/* Right Header Actions: Upload, +, User Avatar */}
        <XStack items="center" gap="$3">
          <Button size="icon-sm" onClick={() => fileInputRef.current?.click()} aria-label="Upload" title="Upload">
            <Upload size={15} />
          </Button>

          <Button size="icon-sm" onClick={() => setNaming({ kind: 'folder', value: '' })} aria-label="Add Folder" title="Add Folder">
            <Plus size={16} />
          </Button>

          {/* Avatar */}
          <Text
            {...tip(userEmail)}
            width={32}
            height={32}
            rounded={9999}
            bg="$raised"
            borderWidth={1}
            borderColor="$borderColor"
            display="flex"
            items="center"
            justify="center"
            fontSize="$2"
            fontWeight="600"
            color="$ink"
          >
            {userInitials}
          </Text>
        </XStack>
      </XStack>

      {/* Main Container: Left Sub-Sidebar + Content */}
      <XStack flex={1} minH={0} overflow="hidden" position="relative">
        {/* The veil behind the phone drawer: a press outside it closes it. */}
        <View
          display="none"
          $max-md={{ display: menu ? 'flex' : 'none' }}
          position="absolute"
          t={0}
          r={0}
          b={0}
          l={0}
          z="var(--z-scrim)"
          bg="var(--surface-scrim)"
          onPress={() => setMenu(false)}
          aria-hidden
        />
        {/* Left Sub-Sidebar: a column from md, a drawer over the files below it. */}
        <YStack
          id="drive-menu"
          width={240}
          minW={240}
          bg="$background"
          borderRightWidth={1}
          borderColor="$borderColor"
          px="$3"
          py="$4"
          justify="space-between"
          $max-md={{
            display: menu ? 'flex' : 'none',
            position: 'absolute',
            t: 0,
            b: 0,
            l: 0,
            z: 'var(--z-drawer)',
            overflowY: 'auto',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <YStack gap="$4">
            {/* + New Button with Dropdown */}
            <View position="relative">
              <Button
                size="lg"
                width="100%"
                justify="space-between"
                onClick={() => setNewMenuOpen((v) => !v)}
                aria-expanded={newMenuOpen}
              >
                <XStack items="center" gap="$2">
                  <Plus size={16} />
                  <Text fontSize="$3" fontWeight="500" color="$ink">
                    New
                  </Text>
                </XStack>
                <ChevronDown size={14} opacity={0.65} />
              </Button>

              {newMenuOpen ? (
                <YStack
                  position="absolute"
                  t="100%"
                  mt={6}
                  l={0}
                  width="100%"
                  bg="var(--popover)"
                  borderWidth={1}
                  borderColor="$borderColor"
                  rounded={10}
                  boxShadow="var(--shadow-lg)"
                  z="var(--z-dropdown)"
                  p={6}
                  gap={2}
                >
                  <Button
                    {...ITEM}
                    onClick={() => {
                      setNewMenuOpen(false)
                      setMenu(false)
                      setNaming({ kind: 'folder', value: '' })
                    }}
                  >
                    <FolderPlus size={14} />
                    New folder
                  </Button>
                  <View height={1} bg="$borderColor" my={4} />
                  <Button
                    {...ITEM}
                    onClick={() => {
                      setNewMenuOpen(false)
                      setMenu(false)
                      fileInputRef.current?.click()
                    }}
                  >
                    <Upload size={14} />
                    File upload
                  </Button>
                  <Button
                    {...ITEM}
                    onClick={() => {
                      setNewMenuOpen(false)
                      setMenu(false)
                      folderInputRef.current?.click()
                    }}
                  >
                    <FolderInput size={14} />
                    Folder upload
                  </Button>
                </YStack>
              ) : null}
            </View>

            {/* Navigation links */}
            <YStack gap="$1">
              {[
                { id: 'my-drive', label: 'My Drive', icon: HardDrive },
                { id: 'recent', label: 'Recent', icon: Clock },
              ].map((item) => {
                const isActive = navSection === item.id && !bucket && !prefix
                const Icon = item.icon
                return (
                  <Button
                    key={item.id}
                    variant={isActive ? 'secondary' : 'ghost'}
                    width="100%"
                    justify="flex-start"
                    gap={12}
                    px={12}
                    color={isActive ? '$ink' : '$soft'}
                    fontWeight={isActive ? '600' : '500'}
                    onClick={() => {
                      setNavSection(item.id as NavSection)
                      openBucket(null)
                      setPrefix('')
                      setMenu(false)
                    }}
                  >
                    <Icon size={16} />
                    {item.label}
                  </Button>
                )
              })}
            </YStack>

            {/* Storage Progress Section */}
            <YStack gap="$2" mt="$2" px="$2">
              <Text fontSize={11} fontWeight="600" color="$faint" letterSpacing={0.6}>
                Storage
              </Text>
              <Text fontSize={12} color="$quiet">
                {usage ? `${usage.capped ? 'over ' : ''}${weigh(usage.bytes)} in ${usage.files.toLocaleString()} file${usage.files === 1 ? '' : 's'}` : 'Measuring…'}
              </Text>
              <Button asChild size="sm" mt={8}>
                <a href={checkoutUrl()} target="_blank" rel="noreferrer">
                  Manage storage
                </a>
              </Button>
            </YStack>
          </YStack>

          {/* Bottom Card: Hanzo Drive Enterprise promo */}
          <YStack px={14} py={12} rounded={10} borderWidth={1} borderColor="$borderColor" bg="$panel" gap={6}>
            <XStack items="center" gap="$2">
              <Cloud size={16} color="var(--foreground)" />
              <Text fontSize="$2" fontWeight="600" color="$ink">Hanzo Drive</Text>
            </XStack>
            <Text fontSize="$1" color="$soft">
              {[userEmail, activeBucket].filter(Boolean).join(' · ')}
            </Text>
            <Button asChild variant="link" size="sm" px={0} mt={4} justify="flex-start">
              <a href="https://docs.hanzo.ai/docs/openapi/s3/" target="_blank" rel="noreferrer">
                Documentation
                <ArrowRight size={12} />
              </a>
            </Button>
          </YStack>
        </YStack>

        {/* Main Content Area */}
        <YStack flex={1} minH={0} px="$6" py="$5" overflowY="auto" overflowX="hidden" gap="$5">
          {/* Breadcrumb / Location Bar when inside a bucket or folder */}
          {bucket || prefix ? (
            <XStack items="center" gap="$2" pb="$2" borderBottomWidth={1} borderColor="$borderColor">
              <Button
                {...CRUMB}
                color="$soft"
                onClick={() => {
                  openBucket(null)
                  setPrefix('')
                }}
              >
                Drive
              </Button>
              <ChevronRight size={13} color="var(--muted-foreground)" />
              <Button {...CRUMB} color={crumbs.length === 0 ? '$ink' : '$soft'} onClick={() => setPrefix('')}>
                {bucket || 'hanzo'}
              </Button>
              {crumbs.map((c, i) => (
                <React.Fragment key={`${i}-${c}`}>
                  <ChevronRight size={13} color="var(--muted-foreground)" />
                  <Button
                    {...CRUMB}
                    color={i === crumbs.length - 1 ? '$ink' : '$soft'}
                    onClick={() => setPrefix(crumbs.slice(0, i + 1).map((x) => `${x}/`).join(''))}
                  >
                    {c}
                  </Button>
                </React.Fragment>
              ))}
            </XStack>
          ) : null}

          {/* Heading + View Mode Pill */}
          <XStack items="center" justify="space-between">
            <YStack gap="$1">
              <Text render="h1" fontSize={26} fontWeight="700" color="$ink">
                Drive
              </Text>
              <Text fontSize={13} color="$soft">
                Secure. Private. Built for builders.
              </Text>
            </YStack>

            {/* View Mode Toggle Pill (List, Grid, Details) */}
            <XStack items="center" bg="$panel" rounded={8} borderWidth={1} borderColor="$borderColor" p={2} gap={2}>
              {([
                ['list', 'List View', List],
                ['grid', 'Grid View', LayoutGrid],
                ['details', 'Details View', MoreHorizontal],
              ] as const).map(([mode, label, Icon]) => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  color={viewMode === mode ? '$ink' : '$soft'}
                  onClick={() => setViewMode(mode)}
                  aria-label={label}
                  aria-pressed={viewMode === mode}
                  title={label}
                >
                  <Icon size={14} />
                </Button>
              ))}
            </XStack>
          </XStack>

          {/* New folder creation inline prompt */}
          {naming ? (
            <XStack
              items="center"
              gap="$3"
              py={10} px={14}
              rounded={8}
              borderWidth={1}
              borderColor="var(--border-control)"
              bg="$panel"
            >
              <Folder size={16} color="var(--foreground)" />
              <Text
                render={
                  <input
                    autoFocus
                    value={naming.value}
                    onChange={(e) => setNaming({ ...naming, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setNaming(null)
                      if (e.key === 'Enter') handleCreateFolder(naming.value)
                    }}
                    placeholder="Folder name"
                    aria-label="Folder name"
                  />
                }
                {...BARE}
              />
              <Button variant="primary" size="sm" onClick={() => handleCreateFolder(naming.value)}>
                Create
              </Button>
              <Button variant="ghost" size="sm" color="$soft" onClick={() => setNaming(null)}>
                Cancel
              </Button>
            </XStack>
          ) : null}

          {/* Busy notification */}
          {busy ? (
            <Text fontSize="$2" color="$soft" data-slot="drive-busy">{busy}…</Text>
          ) : null}

          {/* What the files say about the search, passage by passage. */}
          {hits && hits.length ? <Hits hits={hits} onOpen={(p) => showContents(p.file.id, p.section.id)} /> : null}

          {/* If we are inside a Bucket/Folder, show its files & folders */}
          {bucket || prefix ? (
            <YStack gap="$2">
              <YStack borderWidth={1} borderColor="$borderColor" rounded={8} overflowX="auto" overflowY="hidden">
                {/* Table Header */}
                <View
                  display="grid"
                  gridTemplateColumns={FILES}
                  minW="min-content"
                  px={16}
                  py={10}
                  borderBottomWidth={1}
                  borderColor="$borderColor"
                >
                  <Text {...HEAD}>NAME</Text>
                  <Text {...HEAD}>TYPE</Text>
                  <Text {...HEAD}>UPDATED ↓</Text>
                  <Text {...HEAD}>SIZE</Text>
                  <View />
                </View>

                {/* Table Rows or None */}
                {!filteredEntries || filteredEntries.length === 0 ? (
                  <Text py={36} px={16} text="center" fontSize="$2" color="$faint">
                    None
                  </Text>
                ) : (
                  filteredEntries.map((e) => {
                    const isFolder = e.isDir || e.key.endsWith('/')
                    const cleanName = e.key.replace(/\/+$/, '')
                    return (
                      <View
                        key={e.key}
                        display="grid"
                        gridTemplateColumns={FILES}
                        minW="min-content"
                        px={16}
                        py={11}
                        items="center"
                        cursor="pointer"
                        borderBottomWidth={1}
                        borderColor="$borderColor"
                        transition="100ms"
                        hoverStyle={{ bg: '$hover' }}
                        onClick={() => {
                          if (isFolder) {
                            setPrefix(`${prefix}${cleanName}/`)
                          } else {
                            handleDownload(e)
                          }
                        }}
                      >
                        <XStack items="center" gap="$2.5" minW={0}>
                          <Glyph entry={e} size={16} />
                          <YStack minW={0}>
                            <Text {...NAME}>{cleanName}</Text>
                            {!isFolder && index.get(prefix + e.key) ? <Badge f={index.get(prefix + e.key)!} /> : null}
                          </YStack>
                        </XStack>

                        <View items="flex-start">
                          <Text {...CHIP}>{isFolder ? 'Folder' : cleanName.split('.').pop()?.toUpperCase() || 'File'}</Text>
                        </View>

                        <Text {...CELL}>{when(e.lastModified)}</Text>

                        <Text {...CELL}>{weigh(e.size)}</Text>

                        <View position="relative" items="flex-start">
                          <More
                            onPress={(ev) => {
                              ev.stopPropagation()
                              setItemMenuKey(itemMenuKey === e.key ? null : e.key)
                            }}
                          />

                          {itemMenuKey === e.key ? (
                            <YStack
                              position="absolute"
                              r={0}
                              t="100%"
                              bg="var(--popover)"
                              borderWidth={1}
                              borderColor="$borderColor"
                              rounded={8}
                              boxShadow="var(--shadow-lg)"
                              z="var(--z-dropdown)"
                              p={4}
                              minW={140}
                              onClick={(ev: { stopPropagation: () => void }) => ev.stopPropagation()}
                            >
                              {!isFolder && index.get(prefix + e.key) ? (
                                <>
                                  <Pick
                                    icon={ListTree}
                                    label="Contents"
                                    onPress={() => {
                                      setItemMenuKey(null)
                                      setContents({ file: index.get(prefix + e.key)! })
                                    }}
                                  />
                                  <Pick
                                    icon={MessageSquare}
                                    label="Ask in chat"
                                    onPress={() => {
                                      setItemMenuKey(null)
                                      askInChat(index.get(prefix + e.key)!)
                                    }}
                                  />
                                </>
                              ) : null}
                              {!isFolder ? (
                                <Pick
                                  icon={Download}
                                  label="Download"
                                  onPress={() => {
                                    setItemMenuKey(null)
                                    handleDownload(e)
                                  }}
                                />
                              ) : null}
                              <Pick
                                icon={Trash2}
                                label="Delete"
                                tone={BAD}
                                onPress={() => {
                                  setItemMenuKey(null)
                                  handleDelete(e)
                                }}
                              />
                            </YStack>
                          ) : null}
                        </View>
                      </View>
                    )
                  })
                )}
              </YStack>
            </YStack>
          ) : (
            /* Root View: Storage Buckets + Projects (Unified VFS) */
            <>
              {/* Storage Buckets Section */}
              <YStack gap="$2.5">
                <Text fontSize={12} fontWeight="600" color="$soft">
                  Storage Buckets
                </Text>

                <YStack borderWidth={1} borderColor="$borderColor" rounded={8} overflowX="auto" overflowY="hidden">
                  {failed ? (
                    <Text {...NOTE}>
                      {failed}
                      <Button
                        size="sm"
                        mx="auto"
                        mt={10}
                        onClick={() => {
                          setFailed(null)
                          setReload((n) => n + 1)
                        }}
                      >
                        Try again
                      </Button>
                    </Text>
                  ) : !buckets ? (
                    <Text {...NOTE}>Reading your storage…</Text>
                  ) : buckets.length === 0 ? (
                    <Text {...NOTE}>No buckets yet.</Text>
                  ) : (
                    buckets.map((b) => (
                      <XStack
                        key={b.name}
                        onClick={() => openBucket(b.name)}
                        items="center"
                        justify="space-between"
                        px={16}
                        py={12}
                        cursor="pointer"
                        bg="transparent"
                        transition="100ms"
                        hoverStyle={{ bg: '$hover' }}
                      >
                        <XStack items="center" gap="$2.5">
                          <Folder size={17} color="var(--foreground)" />
                          <Text fontSize="$2" fontWeight="500" color="$ink">{getBucketDisplayName(b)}</Text>
                        </XStack>

                        <XStack items="center" gap="$4">
                          <Text fontSize="$2" color="$faint">{when(b.createdAt)}</Text>
                          <More onPress={(e) => e.stopPropagation()} />
                        </XStack>
                      </XStack>
                    ))
                  )}
                </YStack>
              </YStack>

              {/* Projects (Unified VFS) Section */}
              <YStack gap="$2.5">
                <Text fontSize={12} fontWeight="600" color="$soft">
                  Projects (Unified VFS)
                </Text>

                <YStack borderWidth={1} borderColor="$borderColor" rounded={8} overflowX="auto" overflowY="hidden">
                  {/* Table Header */}
                  <View
                    display="grid"
                    gridTemplateColumns={PROJECTS}
                    minW="min-content"
                    px={16}
                    py={10}
                    borderBottomWidth={1}
                    borderColor="$borderColor"
                  >
                    <Text {...HEAD}>NAME</Text>
                    <Text {...HEAD}>TYPE</Text>
                    <Text {...HEAD}>UPDATED ↓</Text>
                    <Text {...HEAD}>SIZE</Text>
                    <View />
                  </View>

                  {/* Table Rows or None */}
                  {filteredProjects.length === 0 ? (
                    <Text py={36} px={16} text="center" fontSize="$2" color="$faint">
                      None
                    </Text>
                  ) : (
                    filteredProjects.map((p) => (
                      <View
                        key={p.id}
                        onClick={() => {
                          const targetBucket = buckets[0]?.name || 'hanzo'
                          openBucket(targetBucket)
                          setPrefix(`projects/${p.name || p.id}/`)
                        }}
                        display="grid"
                        gridTemplateColumns={PROJECTS}
                        minW="min-content"
                        px={16}
                        py={11}
                        items="center"
                        cursor="pointer"
                        borderBottomWidth={1}
                        borderColor="$borderColor"
                        transition="100ms"
                        hoverStyle={{ bg: '$hover' }}
                      >
                        <XStack items="center" gap="$2.5" minW={0}>
                          <Folder size={16} color="var(--foreground)" />
                          <Text {...NAME}>{p.name}</Text>
                        </XStack>

                        <View items="flex-start">
                          <Text {...CHIP}>{p.type}</Text>
                        </View>

                        <Text {...CELL}>{p.updated}</Text>

                        <Text {...CELL}>{p.size}</Text>

                        <View items="flex-start">
                          <More onPress={(e) => e.stopPropagation()} />
                        </View>
                      </View>
                    ))
                  )}
                </YStack>
              </YStack>
            </>
          )}
        </YStack>
      </XStack>

      {contents && client ? (
        <Contents
          api={client}
          file={contents.file}
          at={contents.at}
          onClose={() => setContents(null)}
          onAsk={askInChat}
          onFollow={(id, at) => showContents(id, at)}
        />
      ) : null}

      {/* Drag overlay */}
      {over ? (
        <Box
          position="absolute"
          t={0}
          l={0}
          r={0}
          b={0}
          z={1000}
          bg={VEIL}
          borderWidth={2}
          borderStyle="dashed"
          borderColor="var(--ring)"
          rounded="$3"
          display="flex"
          items="center"
          justify="center"
          pointerEvents="none"
        >
          <YStack items="center" gap="$2">
            <Upload size={36} color="currentColor" />
            <Text fontSize="$4" fontWeight="600" color="$ink">
              Drop files to upload to {bucket || workspace}
            </Text>
          </YStack>
        </Box>
      ) : null}
    </YStack>
  )
}
