'use client'

// What Chat puts in the one side panel (@hanzo/build `Panel`, the panel Dev's
// runs use): Artifacts, what the conversation made, and Sources, what went into
// it and what it looked up. Pressing either opens it as a page tab — an
// answer's `index.html` rendered from its own bytes, a picture, a workspace
// file — beside the two.
//
// OUTPUTS AND SOURCES ARE DERIVED FROM THE TURNS, never from a second list kept
// in step with them: the conversation is the record, so a fenced block in an
// answer IS an output (@hanzo/build `artifacts`), and an image in a question, a
// file it carried, or a block in it that names a file IS a source. The one
// thing listed that is not yet a turn is what is held for the next message
// (`hold` in `pane.ts`), which a send spends into one.
//
// The panel's tabs, their order and the open one are kept per conversation by
// @hanzo/build (`useDeck`, scope `chat:<channel>`); the frame owns the column
// it stands in (`Beside` in `Shell.tsx`).

import { useMemo, useState, type ReactNode } from 'react'
import { FileCode, Image as ImageMark, Paperclip, Plus, Search } from 'lucide-react'
import {
  Box,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
  YStack,
} from '@hanzo/ui'
import { useAi, type ChatMessage } from '@hanzo/ai/react'
import { artifacts, name as titleOf, PAGE, type Deck, type Kind, type Tabs } from '@hanzo/build'
import { Card, Quiet, Row } from './card'
import { said as told } from './lib/attach'
import { download, fileOf, type Api } from './lib/files'
import { org } from './lib/session'
import { localOf, take, type Held } from './pane'
import { useProviders, useSkills } from './tools'
import { activate, startDevice } from './connect'

/** A conversation's panel before anyone has arranged it. */
export const SEED: Tabs = {
  tabs: [
    { id: 'artifacts', kind: 'artifacts', title: 'Artifacts' },
    { id: 'sources', kind: 'sources', title: 'Sources' },
  ],
  at: 'artifacts',
}

/**
 * One thing the conversation carries.
 *
 * `href` is where it can be opened and `body` the text of something that was
 * never a file — a fenced block exists only in the transcript until somebody
 * looks at it, and then it is rendered from these bytes.
 */
export interface Mark {
  id: string
  name: string
  kind: 'image' | 'code' | 'file'
  href?: string
  body?: string
  /** The type a browser should take it as, so it renders rather than downloads. */
  mime?: string
  /** A workspace file's id: it opens through a signed address minted when it is looked at. */
  file?: string
}

/** The text of a turn, whichever shape the wire used. */
const words = (m: ChatMessage): string =>
  typeof m.content === 'string'
    ? m.content
    : Array.isArray(m.content)
      ? m.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n')
      : ''

/** Every image a turn carries, as addresses. */
const pictures = (m: ChatMessage): string[] =>
  Array.isArray(m.content)
    ? m.content.flatMap((p) => (p.type === 'image_url' && p.image_url?.url ? [p.image_url.url] : []))
    : []

/** What the assistant made: fenced blocks and pictures, in the order they were said. */
function outputs(said: ChatMessage[]): Mark[] {
  const out: Mark[] = []
  said.forEach((m, turn) => {
    if (m.role !== 'assistant') return
    artifacts(words(m)).forEach((a, n) => out.push({ id: `o${turn}.${n}`, name: a.name, kind: 'code', body: a.body, mime: a.mime }))
    pictures(m).forEach((href, i) => out.push({ id: `oi${turn}.${i}`, name: 'Generated image', kind: 'image', href }))
  })
  return out
}

/**
 * What went into this conversation: pictures asked about, files a turn carried,
 * files sent fenced under their names (`compose` in `lib/attach`), and files
 * held for the next message.
 */
function sources(said: ChatMessage[], held: Held[]): Mark[] {
  const out: Mark[] = []
  said.forEach((m, turn) => {
    if (m.role !== 'user') return
    pictures(m).forEach((href, i) => out.push({ id: `s${turn}.${i}`, name: 'Attached image', kind: 'image', href }))
    const read = told(words(m))
    for (const f of read.carried?.attached ?? []) {
      out.push({ id: `sw${turn}.${f.id}`, name: f.name, kind: f.type.startsWith('image/') ? 'image' : 'file', file: f.id, mime: f.type })
    }
    // A block sent under a file's name; a block that names only a language is not a source.
    artifacts(read.text).forEach((a, n) => {
      if (a.name.includes('.')) out.push({ id: `sf${turn}.${n}`, name: a.name, kind: 'file', body: a.body, mime: a.mime })
    })
  })
  for (const h of held) {
    out.push({ id: h.id, name: h.name, kind: h.type.startsWith('image/') ? 'image' : 'file', href: h.href || undefined, file: h.file?.id, mime: h.type })
  }
  return out
}

/** What the conversation looked up: each call, what it asked, and what came back, keyed by the call. */
function lookups(said: ChatMessage[]) {
  const back = new Map<string, string>()
  for (const m of said) if (m.role === 'tool' && m.tool_call_id) back.set(m.tool_call_id, typeof m.content === 'string' ? m.content : '')
  return said
    .flatMap((m) => m.tool_calls ?? [])
    .map((call) => ({ id: call.id, name: call.function.name, asked: call.function.arguments, got: back.get(call.id) ?? null }))
}

const GLYPH: Record<Mark['kind'], typeof ImageMark> = { image: ImageMark, code: FileCode, file: Paperclip }

/**
 * Opens a mark as a page tab: a row under Artifacts or Sources, or a file a
 * message carries (Chat's chips).
 *
 * A block is rendered from its own bytes, which the tab keeps, so it is there
 * after a reload. A workspace file opens through a signed address minted now,
 * the bytes this document still holds first (`localOf`).
 */
export async function look(deck: Deck, m: Mark, api: Api): Promise<void> {
  if (m.body !== undefined) return deck.open({ kind: PAGE, title: m.name, body: m.body, type: m.mime })
  if (m.href) return deck.open({ kind: PAGE, title: m.name, url: m.href, type: m.mime })
  if (!m.file) return
  const near = localOf(m.file)
  if (near) return deck.open({ kind: PAGE, title: m.name, url: near, type: m.mime })
  try {
    const f = await fileOf(api, m.file)
    deck.open({ kind: PAGE, title: m.name, url: await download(api, f.bucket, f.key), type: m.mime })
  } catch {
    // A file forgotten or a store unreachable opens nothing; the row stays.
  }
}

/** A list of marks, every one of them; pressing one opens it. */
function Marks({ kind, title, icon, marks, deck, action, children }: { kind: string; title: string; icon: ReactNode; marks: Mark[]; deck: Deck; action?: ReactNode; children: ReactNode }) {
  const ai = useAi()
  return (
    <Card kind={kind} icon={icon} title={title} action={action}>
      {marks.length === 0 ? <Quiet>{children}</Quiet> : null}
      {marks.map((m) => {
        const Glyph = GLYPH[m.kind]
        return (
          <Row key={m.id} icon={<Glyph size={16} aria-hidden />} onPress={() => void look(deck, m, ai)}>
            {m.name}
          </Row>
        )
      })}
    </Card>
  )
}

/** Chat's kinds of tab, over the conversation `said` and the files `held` for the next message. */
export function useKinds({ at, said, held, deck }: { at: string; said: ChatMessage[]; held: Held[]; deck: Deck }): Kind[] {
  const made = useMemo(() => outputs(said), [said])
  const took = useMemo(() => sources(said, held), [said, held])
  const done = useMemo(() => lookups(said), [said])
  return [
    {
      id: 'artifacts',
      label: 'Artifacts',
      render: () => (
        <Marks kind="outputs" title="Outputs" icon={<FileCode size={16} aria-hidden />} marks={made} deck={deck}>
          This conversation has produced nothing yet.
        </Marks>
      ),
    },
    {
      id: 'sources',
      label: 'Sources',
      render: () => (
        <YStack gap="$3">
          <Marks kind="sources" title="Sources" icon={<Paperclip size={16} aria-hidden />} marks={took} deck={deck} action={<Add at={at} />}>
            Nothing has been put into this conversation yet.
          </Marks>
          <Card kind="lookups" icon={<Search size={16} aria-hidden />} title="Looked up">
            {done.length === 0 ? <Quiet>Nothing was looked up for this conversation yet.</Quiet> : null}
            {done.map((call) => (
              <YStack key={call.id} gap="$1" p="$2" rounded="$3" borderWidth={1} borderColor="$borderColor">
                <Text fontSize="$2" color="$ink">
                  {call.name}
                </Text>
                <Text fontSize="$1" color="$soft" numberOfLines={2}>
                  {call.asked}
                </Text>
                {/* A call still in flight has no answer yet, which is a state and reads as one. */}
                <Text fontSize="$1" color="$soft" numberOfLines={6}>
                  {call.got ?? 'Running…'}
                </Text>
              </YStack>
            ))}
          </Card>
        </YStack>
      ),
    },
  ]
}

/**
 * A menu row's words.
 *
 * gui RENDERS NO BARE STRING. Every view is a react-native-web `View`, which
 * refuses a raw text child — `DropdownMenuItem` wraps one for you and
 * `DropdownMenuSubTrigger` does not — so every row is wrapped once here.
 */
const Word = ({ children }: { children: ReactNode }) => (
  <Text fontSize="$2" color="$ink" numberOfLines={1}>
    {children}
  </Text>
)

/** A menu row that is a statement rather than a control, wrapped for the same reason. */
const Note = ({ children }: { children: ReactNode }) => (
  <DropdownMenuLabel>
    <Text fontSize="$2" color="$soft">
      {children}
    </Text>
  </DropdownMenuLabel>
)

/**
 * The `+` on Sources: everything a reader can bring into this conversation.
 *
 * EVERY ROW DOES SOMETHING. Files come off the reader's own disk. Skills are
 * `GET /v1/tools/skills` and toggling one is `PUT /v1/tools/activation`, the
 * one write path that turns skills, plugins and connectors into callable tools.
 * Services are `GET /v1/integrations/connectors/providers`, connected by the
 * device flow their cards declare. One panel, not flyouts: it hangs off the
 * right edge of the window, where a submenu has no room to open.
 */
function Add({ at }: { at: string }) {
  const ai = useAi()
  return (
    <DropdownMenu placement="bottom-end" maxHeight={420}>
      <DropdownMenuTrigger asChild>
        <Box render="button" aria-label="Add to this conversation" p="$1" rounded="$2" hoverStyle={{ bg: '$hover' }}>
          <Plus size={16} aria-hidden />
        </Box>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => take(at, { api: ai, org: org() })}>
          <Word>Attach files</Word>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <Skills />
        <DropdownMenuSeparator />
        <Services />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * What this org's agents can reach for, as checkbox rows: `menuitemcheckbox`
 * with `aria-checked`, so the state is read as well as seen.
 */
function Skills() {
  const { rows, trouble } = useSkills()
  const [busy, setBusy] = useState<string | null>(null)
  const [on, setOn] = useState<Set<string> | null>(null)

  if (trouble) return <Note>{trouble}</Note>
  if (rows === null) return <Note>Reading skills.</Note>
  if (rows.length === 0) return <Note>No skills on this account yet.</Note>

  // The server's set once it has answered, and the list's own flag until then.
  const isOn = (n: string, was: boolean) => (on ? on.has(n) : was)

  return (
    <>
      <Note>Skills</Note>
      {rows.map((s) => {
        const lit = isOn(s.name, s.activated)
        return (
          <DropdownMenuCheckboxItem
            key={s.name}
            checked={lit}
            // Held open: switching two skills on is one errand.
            onSelect={(e?: Event) => e?.preventDefault()}
            onCheckedChange={() => {
              setBusy(s.name)
              // The answer is the whole set, so a refusal or another tab's change shows.
              void activate(s.name, !lit)
                .then((enabled) => setOn(new Set(enabled)))
                .catch(() => {})
                .finally(() => setBusy(null))
            }}
          >
            <Word>{busy === s.name ? `${s.name}…` : s.name}</Word>
          </DropdownMenuCheckboxItem>
        )
      })}
    </>
  )
}

/** What this account could connect, narrowed to the device flow, the one intake this menu can finish. */
function Services() {
  const { rows, trouble } = useProviders()
  const [step, setStep] = useState<string | null>(null)

  if (trouble) return <Note>{trouble}</Note>
  if (rows === null) return <Note>Reading.</Note>

  const can = rows.filter((p) => p.methods.includes('device'))
  if (can.length === 0) return <Note>Nothing to connect from here yet.</Note>

  return (
    <>
      <Note>{step ?? 'Connect'}</Note>
      {can.map((p) => (
        <DropdownMenuItem
          key={p.id}
          onSelect={(e?: Event) => e?.preventDefault()}
          onClick={() => {
            setStep(`Starting ${p.name}…`)
            void startDevice(p.id)
              .then((begun) => {
                // The code is the reader's to type at the provider's page.
                setStep(`Enter ${begun.userCode} at ${titleOf(begun.verifyUrl)}`)
                window.open(begun.verifyUrl, '_blank', 'noopener,noreferrer')
              })
              .catch((e: unknown) => setStep(String((e as Error)?.message ?? 'Could not start')))
          }}
        >
          <Word>{p.name}</Word>
        </DropdownMenuItem>
      ))}
    </>
  )
}
