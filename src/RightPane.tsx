'use client'

// The column beside a conversation: what it produced, what went into it, and a
// browser for looking at any of it.
//
// WHAT THIS REPLACED. It was a channel tree — `remington`, `selectric`,
// `zed-student-ambassador`, `londonmaxxing` — none of which are this product's
// channels, hand-written into the markup beside a roster of eleven agents. It
// drew a NAVIGATION surface in the one place the frame reserves for a room's
// own contents, duplicating the rail on the opposite edge, and it did it in
// sky blue against a design that has no hue in it. Nothing here reads a list
// somebody typed.
//
// OUTPUTS AND SOURCES ARE DERIVED FROM THE TURNS, never from a second list kept
// in step with them. `LLM.md` already states this rule for `Work` and it is the
// same rule: the conversation is the record, so a fenced block in an answer IS
// an output, and an image in a question or a block in it that names a file IS a
// source. There is nothing to sync, nothing to invalidate, and no count that
// can disagree with the transcript — and switching channels costs no request,
// because the turns are already in hand. The one thing listed that is not yet
// a turn is what is held for the next message (`hold` in `pane.ts`), which a
// send spends into one. A conversation that has produced nothing says so.
//
// THE COLUMN IS STACKED, NOT SPLIT. The reference this follows puts a ~300px
// summary beside a wide browser, which needs about 900px of column; the frame
// gives this one 200–480 (`FLOOR`/`CEIL` in `Shell.tsx`), so side by side would
// leave the browser about 80px wide. Stacked, both are usable at every width
// the frame allows, and the pin earns its keep — hiding the summary gives the
// browser the whole height rather than a slightly wider strip.
//
// The frame owns the column; this is one of the things a room puts in it. It
// draws no column of its own — see `Beside` in `Shell.tsx`.

import { useMemo, useState, type ReactNode } from 'react'
import {
  ExternalLink,
  FileCode,
  Image as ImageMark,
  Paperclip,
  PanelRightClose,
  Plus,
  RotateCw,
  X,
} from 'lucide-react'
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
  View,
  XStack,
  YStack,
} from '@hanzo/ui'
import { useAi, type ChatMessage } from '@hanzo/ai/react'
import { Card, Quiet, Row } from './card'
import { said as told } from './lib/attach'
import { download, fileOf, type Api } from './lib/files'
import { org } from './lib/session'
import { useOpen } from './open'
import {
  address,
  channel,
  name as titleOf,
  openTab,
  pickTab,
  pin,
  shutTab,
  take,
  usePane,
  type Held,
  type Leaf,
} from './pane'
import { useProviders, useSkills } from './tools'
import { activate, startDevice } from './connect'

/** How many rows a card shows before it offers the rest. */
const FEW = 5

/**
 * One thing the conversation carries.
 *
 * `href` is where it can be opened and `body` is the text of something that was
 * never a file — a fenced block exists only in the transcript until somebody
 * asks to look at it, at which point `body` becomes a blob and gets an address.
 */
interface Mark {
  id: string
  name: string
  kind: 'image' | 'code' | 'file'
  href?: string
  body?: string
  /** The type a blob should carry, so a browser renders it rather than downloads it. */
  mime?: string
  /** A workspace file's id: it opens through a signed address minted when it is looked at. */
  file?: string
}

/** Fenced blocks, as a model writes them. The info string is whatever followed
 *  the ticks — a language, or a path when the answer named one. */
const FENCE = /```([^\n`]*)\n([\s\S]*?)```/g

/** What a fence's info string means for the browser that will render it. */
const MIME: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  svg: 'image/svg+xml',
  css: 'text/css',
  csv: 'text/csv',
  json: 'application/json',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
}

/** The extension, lowercased, or '' where a name has none. */
const suffix = (s: string): string => {
  const dot = s.lastIndexOf('.')
  return dot > 0 ? s.slice(dot + 1).toLowerCase() : ''
}

/**
 * What a fence is called.
 *
 * AN INFO STRING IS A FILENAME OR A LANGUAGE, and telling them apart is the
 * whole of it: a model writing to a file names it, and one showing a snippet
 * names the language. A dot and no spaces is a name; anything else is a
 * language, said as what it is rather than dressed up as a file that does not
 * exist.
 */
const fenceName = (info: string, n: number): string => {
  const word = info.trim().split(/\s+/)[0] ?? ''
  if (!word) return `Block ${n}`
  if (word.includes('.') && suffix(word)) return word
  return `${word} block`
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

/**
 * What the assistant made in this conversation.
 *
 * Fenced blocks and pictures, in the order they were said. The id carries the
 * turn's index so it survives a re-render without a counter of its own, and so
 * two identical blocks in one conversation stay two rows.
 */
function outputs(said: ChatMessage[]): Mark[] {
  const out: Mark[] = []
  said.forEach((m, turn) => {
    if (m.role !== 'assistant') return
    // Files a turn carried by reference: their names in the turn, their bytes in the workspace.
    const read = told(words(m))
    for (const f of read.carried?.attached ?? []) {
      out.push({ id: `sw${turn}.${f.id}`, name: f.name, kind: f.type.startsWith('image/') ? 'image' : 'file', file: f.id, mime: f.type })
    }
    let n = 0
    for (const [, info, body] of read.text.matchAll(FENCE)) {
      n += 1
      const named = fenceName(info, n)
      out.push({
        id: `o${turn}.${n}`,
        name: named,
        kind: 'code',
        body,
        mime: MIME[suffix(named) || info.trim().toLowerCase()] ?? 'text/plain',
      })
    }
    pictures(m).forEach((href, i) => {
      out.push({ id: `oi${turn}.${i}`, name: 'Generated image', kind: 'image', href })
    })
  })
  return out
}

/**
 * What went into this conversation: pictures asked about, files sent fenced
 * under their names (`compose` in `lib/attach`), and files held for the next
 * message.
 */
function sources(said: ChatMessage[], held: Held[]): Mark[] {
  const out: Mark[] = []
  said.forEach((m, turn) => {
    if (m.role !== 'user') return
    pictures(m).forEach((href, i) => {
      out.push({ id: `s${turn}.${i}`, name: 'Attached image', kind: 'image', href })
    })
    let n = 0
    for (const [, info, body] of words(m).matchAll(FENCE)) {
      n += 1
      const named = info.trim()
      if (!suffix(named)) continue
      out.push({ id: `sf${turn}.${n}`, name: named, kind: 'file', body, mime: MIME[suffix(named)] ?? 'text/plain' })
    }
  })
  for (const h of held) {
    out.push({ id: h.id, name: h.name, kind: h.type.startsWith('image/') ? 'image' : 'file', href: h.href || undefined, file: h.file?.id, mime: h.type })
  }
  return out
}

const GLYPH: Record<Mark['kind'], typeof ImageMark> = {
  image: ImageMark,
  code: FileCode,
  file: Paperclip,
}

/**
 * The column. `said` is the conversation it stands beside; without one it draws
 * the same shape with nothing in it, which is what a room nobody has spoken in
 * honestly looks like.
 */
export function RightPane({
  said = [],
  onClose,
}: {
  said?: ChatMessage[]
  onClose?: () => void
}) {
  const open = useOpen()
  // ONE KEY, DERIVED, so the pane follows the conversation without anything
  // having to tell it that the conversation changed.
  const at = channel(open)
  const pane = usePane(at)

  return (
    // A FLOOR, NOT ZERO. The column scrolls the panel and the work under it as
    // one; a panel let shrink to nothing in a short column kept drawing its
    // contents, so the tab strip's + sat on the answering model and the empty
    // viewer on the headings below. At its floor the column scrolls instead.
    <YStack flex={1} minH={320} bg="$background" borderLeftWidth={1} borderColor="$borderColor">
      {pane.pinned ? <Summary at={at} said={said} held={pane.held} /> : null}
      <Browser at={at} pane={pane} onClose={onClose} />
    </YStack>
  )
}

/** The two cards: out of the conversation, and into it. */
function Summary({ at, said, held }: { at: string; said: ChatMessage[]; held: Held[] }) {
  // Recomputed only when the turns or the held files change — a channel switch
  // remounts with different turns and costs one pass over them, never a read.
  const made = useMemo(() => outputs(said), [said])
  const took = useMemo(() => sources(said, held), [said, held])

  return (
    <YStack
      shrink={0}
      // A CAP AND NOT A HEIGHT. The summary is as tall as it needs to be until
      // it would take the browser's half, and scrolls after that — so two rows
      // do not reserve a screen and thirty do not push the browser off the
      // bottom of the column.
      maxH="45%"
      overflowY="auto" overflowX="hidden"
      p="$3"
      gap="$3"
      borderBottomWidth={1}
      borderColor="$borderColor"
    >
      <Marks at={at} kind="outputs" title="Outputs" icon={<FileCode size={16} aria-hidden />} marks={made}>
        This conversation has produced nothing yet.
      </Marks>
      <Marks at={at} kind="sources" title="Sources" icon={<Paperclip size={16} aria-hidden />} marks={took}>
        Nothing has been put into this conversation yet.
      </Marks>
    </YStack>
  )
}

/**
 * One card of things, the first {@link FEW} of them, and the honest number of
 * the rest.
 *
 * THE COUNT IS THE LIST'S OWN LENGTH. A row reading "Show 30 more" that is not
 * thirty is the kind of furniture this repo has had to delete twice.
 */
function Marks({
  at,
  kind,
  title,
  icon,
  marks,
  children,
}: {
  at: string
  kind: string
  title: string
  icon: ReactNode
  marks: Mark[]
  /** What to say when there are none. */
  children: ReactNode
}) {
  const ai = useAi()
  const [all, setAll] = useState(false)
  const shown = all ? marks : marks.slice(0, FEW)
  const rest = marks.length - shown.length

  return (
    <Card kind={kind} icon={icon} title={title} action={<Add at={at} />}>
      {marks.length === 0 ? <Quiet>{children}</Quiet> : null}
      {shown.map((m) => {
        const Mark = GLYPH[m.kind]
        return (
          <Row key={m.id} icon={<Mark size={16} aria-hidden />} onPress={() => void look(at, m, ai)}>
            {m.name}
          </Row>
        )
      })}
      {rest > 0 ? (
        <Row onPress={() => setAll(true)}>Show {rest} more</Row>
      ) : all && marks.length > FEW ? (
        <Row onPress={() => setAll(false)}>Show fewer</Row>
      ) : null}
    </Card>
  )
}

/**
 * Opens a mark in this conversation's browser.
 *
 * A BLOCK BECOMES A FILE THE MOMENT SOMEBODY LOOKS AT IT. It has no address
 * until then — it is text inside a turn — so one is minted here from its own
 * bytes, carrying the type its fence declared. That is what makes an answer's
 * `index.html` something you can actually see rather than something you can
 * only read the source of.
 */
async function look(at: string, m: Mark, api: Api): Promise<void> {
  if (!m.href && m.file) {
    try {
      const f = await fileOf(api, m.file)
      openTab(at, await download(api, f.bucket, f.key), m.name)
    } catch {
      // A file forgotten or a store unreachable opens nothing; the row stays.
    }
    return
  }
  const href = m.href ?? (m.body === undefined ? null : URL.createObjectURL(new Blob([m.body], { type: m.mime })))
  if (!href) return
  openTab(at, href, m.name)
}

/**
 * A menu row's words.
 *
 * gui RENDERS NO BARE STRING. Every view is a react-native-web `View`, which
 * refuses a raw text child — `DropdownMenuItem` happens to wrap one for you and
 * `DropdownMenuSubTrigger` does not, so a label written the obvious way threw
 * "Unexpected text node" and took the whole menu down with it. One wrapper for
 * every row means the difference between those two components stops mattering.
 */
const Word = ({ children }: { children: ReactNode }) => (
  <Text fontSize="$2" color="$ink" numberOfLines={1}>
    {children}
  </Text>
)

/** A menu row that is a statement rather than a control — what is being read,
 *  what was refused, which code to type. Wrapped for the same reason. */
const Note = ({ children }: { children: ReactNode }) => (
  <DropdownMenuLabel>
    <Text fontSize="$2" color="$soft">
      {children}
    </Text>
  </DropdownMenuLabel>
)

/**
 * The `+`: everything a reader can bring into this conversation.
 *
 * EVERY ROW DOES SOMETHING. Files come off the reader's own disk. Skills are
 * `GET /v1/tools/skills` and toggling one is `PUT /v1/tools/activation`, which
 * the schema calls "the ONE write path that turns skills, plugins and
 * connectors into callable tools". Services are
 * `GET /v1/integrations/connectors/providers` and connecting one is the device
 * flow those provider cards declare.
 *
 * There is no "Plugins" row. `/v1/tools/plugins` reads like the next one and is
 * an operator's inventory of what this deployment booted with — see the note in
 * `tools.ts`. A row offering a reader subsystems they cannot switch is a row
 * that does nothing.
 *
 * ONE PANEL, NOT FLYOUTS, and that is a fact about WHERE this menu is rather
 * than a preference. The reference has "Use plugins ▸" opening a submenu, which
 * works when the menu has screen to its side; this one hangs off a `+` at the
 * right edge of a column that is itself at the right edge of the window.
 * Measured at 1440: the sub-panel opened at x=1414 and is 190 wide, so 184px of
 * it — every row in it — was off the screen, and `Menu.SubContent` publishes no
 * placement to flip it with. Sections in one panel cannot fall off anything,
 * and they put a skill one press away instead of two.
 */
function Add({ at }: { at: string }) {
  const ai = useAi()
  return (
    <DropdownMenu placement="bottom-end" maxHeight={420}>
      <DropdownMenuTrigger asChild>
        <Box
          render="button"
          aria-label="Add to this conversation"
          p="$1"
          rounded="$2"
          hoverStyle={{ bg: '$hover' }}
        >
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
 * What this org's agents can reach for, as a section of this menu.
 *
 * A CHECKBOX ROW AND NOT A TICK IN A LABEL. `DropdownMenuCheckboxItem` is
 * `role="menuitemcheckbox"` with `aria-checked`, so a screen reader says
 * "checked" where a glyph in the text says nothing at all — and it draws the
 * mark in gui's own indicator well, which a hand-rolled column beside the label
 * cannot line up with. Activation is a two-state fact; this is the component
 * for one.
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
            // HELD OPEN, because switching two skills on is one errand and a
            // menu that shuts on the first makes it two.
            onSelect={(e?: Event) => e?.preventDefault()}
            onCheckedChange={() => {
              setBusy(s.name)
              // THE ANSWER IS THE WHOLE SET, so what comes back replaces what
              // we hold rather than flipping our own flag: a refusal, a clamp,
              // or another tab's change is visible in the reply and invisible
              // in an optimistic toggle.
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

/**
 * What this account could connect.
 *
 * NARROWED TO THE ONE INTAKE THIS PANE CAN FINISH. A provider card declares its
 * methods — `device`, `oauth`, `token` — and the device flow is the only one
 * that completes without a redirect back into a page this column does not own.
 * Offering the others here would be offering a press that goes nowhere; they
 * are connected from the Directory, which is built for it.
 */
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
                // The code is the reader's to type at the provider's page, so
                // it is said here and the page is opened for them.
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

/** The tab strip, the address, and whatever the chosen tab is showing. */
function Browser({
  at,
  pane,
  onClose,
}: {
  at: string
  pane: ReturnType<typeof usePane>
  onClose?: () => void
}) {
  const leaf = pane.tabs.find((t) => t.id === pane.at) ?? null
  // Bumping this remounts the frame, which is the only way to reload a document
  // on an origin we cannot script into.
  const [again, reload] = useState(0)

  return (
    <YStack flex={1} minH={0}>
      <XStack
        // 44 IS THE FLOOR A THUMB NEEDS, and the strip scrolls rather than
        // squeezing its tabs under it — the rule `tabs.tsx` exists to hold.
        minH={44}
        shrink={0}
        items="center"
        gap="$1"
        px="$2"
        overflowX="auto" overflowY="hidden"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        {pane.tabs.map((t) => (
          <Sheet key={t.id} at={at} leaf={t} on={t.id === pane.at} />
        ))}
        <Box
          render="button"
          onClick={() => openTab(at, 'https://hanzo.ai')}
          aria-label="New tab"
          p="$1.5"
          rounded="$2"
          shrink={0}
          hoverStyle={{ bg: '$hover' }}
        >
          <Plus size={16} aria-hidden />
        </Box>
        <Box flex={1} minW="$1" />
        {leaf ? (
          <>
            <Box
              render="button"
              onClick={() => reload((n) => n + 1)}
              aria-label="Reload this tab"
              p="$1.5"
              rounded="$2"
              shrink={0}
              hoverStyle={{ bg: '$hover' }}
            >
              <RotateCw size={16} aria-hidden />
            </Box>
            <Box
              render="button"
              onClick={() => window.open(leaf.url, '_blank', 'noopener,noreferrer')}
              aria-label="Open this tab in a new window"
              p="$1.5"
              rounded="$2"
              shrink={0}
              hoverStyle={{ bg: '$hover' }}
            >
              <ExternalLink size={16} aria-hidden />
            </Box>
          </>
        ) : null}
        {onClose ? (
          <Box
            render="button"
            onClick={onClose}
            aria-label="Hide side panel"
            p="$1.5"
            rounded="$2"
            shrink={0}
            hoverStyle={{ bg: '$hover' }}
          >
            <PanelRightClose size={16} aria-hidden />
          </Box>
        ) : null}
      </XStack>

      {leaf ? <Where at={at} leaf={leaf} /> : null}

      <YStack flex={1} minH={0}>
        {leaf ? (
          <Preview key={`${leaf.id}.${again}`} leaf={leaf} held={pane.held} />
        ) : (
          <YStack flex={1} items="center" justify="center" p="$5" gap="$2">
            <Quiet>Nothing open here.</Quiet>
            <Quiet>Press an output or a source to look at it, or open a tab.</Quiet>
          </YStack>
        )}
      </YStack>
    </YStack>
  )
}

/** One tab: the thing you press, and the cross that shuts it. */
function Sheet({ at, leaf, on }: { at: string; leaf: Leaf; on: boolean }) {
  return (
    <XStack
      items="center"
      gap="$1"
      pl="$2"
      pr="$1"
      minH={32}
      maxW={140}
      shrink={0}
      rounded="$2"
      // A CHOSEN TAB IS THE ONLY ONE WITH AN OUTLINE. Everything else in the
      // strip is a plain control that answers to hover, which is the rule the
      // rest of this pane follows.
      borderWidth={1}
      borderColor={on ? '$borderColor' : 'transparent'}
      bg={on ? '$raised' : 'transparent'}
      hoverStyle={{ bg: on ? '$raised' : '$hover' }}
    >
      <Box render="button" onClick={() => pickTab(at, leaf.id)} aria-current={on} flex={1} minW={0}>
        <Text fontSize="$2" color={on ? '$ink' : '$soft'} numberOfLines={1}>
          {leaf.title}
        </Text>
      </Box>
      <Box
        render="button"
        onClick={() => shutTab(at, leaf.id)}
        aria-label={`Close ${leaf.title}`}
        p="$1"
        rounded="$1"
        hoverStyle={{ bg: '$edge' }}
      >
        <X size={16} aria-hidden />
      </Box>
    </XStack>
  )
}

/**
 * Where the open tab is, and how to go somewhere else.
 *
 * A PATH FOR A FILE AND A FIELD FOR A PAGE, because they are different
 * questions: a blob has no address a reader can retype, so offering one is
 * offering a control that cannot work. The field is the one place in this pane
 * with an outline, which is what the house rule reserves an outline for.
 */
function Where({ at, leaf }: { at: string; leaf: Leaf }) {
  const local = leaf.url.startsWith('blob:')
  const [typed, setTyped] = useState(leaf.url)

  if (local) {
    return (
      <XStack px="$3" py="$2" borderBottomWidth={1} borderColor="$borderColor">
        <Text fontSize="$2" color="$soft" numberOfLines={1}>
          {leaf.title}
        </Text>
      </XStack>
    )
  }

  return (
    <XStack
      items="center"
      px="$2"
      py="$2"
      borderBottomWidth={1}
      borderColor="$borderColor"
    >
      <XStack
        flex={1}
        minW={0}
        items="center"
        px="$2"
        minH={28}
        rounded="$2"
        borderWidth={1}
        borderColor="$borderColor"
        bg="$raised"
      >
        <Text
          render={
            <input
              // KEYED BY THE TAB at the call site above, so switching tabs starts
              // this field at the new tab's address rather than carrying the old
              // one's half-typed text across.
              defaultValue={leaf.url}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openTab(at, address(typed), titleOf(address(typed)))
              }}
              aria-label="Address"
              spellCheck={false}
            />
          }
          width="100%"
          borderWidth={0}
          outlineStyle="none"
          bg="transparent"
          color="var(--foreground)"
          fontSize="$2"
        />
      </XStack>
    </XStack>
  )
}

/**
 * What a tab is showing, or why it is not.
 *
 * A BROWSER CANNOT SHOW EVERY FILE AND SAYING SO IS THE FEATURE. An archive, a
 * font, a binary — a frame pointed at one either downloads it or draws nothing,
 * and drawing nothing is indistinguishable from a broken pane. The type comes
 * off the held file where there is one, because a blob address carries no
 * extension to guess from.
 */
function Preview({ leaf, held }: { leaf: Leaf; held: Held[] }) {
  const mine = held.find((h) => h.href === leaf.url)
  const type = mine?.type ?? ''
  const ext = suffix(mine?.name ?? leaf.title)

  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)) {
    return (
      <YStack flex={1} minH={0} items="center" justify="center" p="$3" overflowY="auto" overflowX="hidden">
        <View render={<img src={leaf.url} alt={leaf.title} />} maxW="100%" maxH="100%" objectFit="contain" />
      </YStack>
    )
  }

  // THE LIST IS OF WHAT A FRAME CAN RENDER, not of what a file might be. A type
  // absent from it is unsupported, which is the honest default: guessing that
  // an unknown type will render is how a reader gets a blank rectangle.
  const shows =
    !mine ||
    type.startsWith('text/') ||
    type === 'application/pdf' ||
    type === 'application/json' ||
    ['html', 'htm', 'txt', 'md', 'json', 'csv', 'pdf', 'css', 'js', 'ts'].includes(ext)

  if (!shows) {
    return (
      <YStack flex={1} items="center" justify="center" p="$5" gap="$2">
        <Quiet>{(ext || type || 'This').toUpperCase()} previews aren’t supported yet.</Quiet>
        <Quiet>Open this file in another app to view it.</Quiet>
      </YStack>
    )
  }

  return (
    <View
      render={
        <iframe
          src={leaf.url}
          title={leaf.title}
          // TWO SANDBOXES, BECAUSE THERE ARE TWO KINDS OF DOCUMENT HERE AND ONE
          // RULE WOULD BE WRONG FOR ONE OF THEM.
          //
          // A `blob:` address INHERITS THE ORIGIN OF THE PAGE THAT MINTED IT — this
          // one. So a model's fenced block granted `allow-same-origin` would run as
          // us, with our `localStorage`, which is where the IAM access token lives
          // (`hanzo_iam_access_token`). An answer that wrote a script tag would be
          // reading the reader's session. It gets `allow-scripts` so a generated
          // page still lays out and runs, and never the pair.
          //
          // A remote page is the opposite case: the iframe takes the REMOTE
          // origin, so `allow-same-origin` grants it nothing of ours and withholding
          // it breaks the site — no cookies, no storage, no fonts on many hosts.
          sandbox={
            leaf.url.startsWith('blob:')
              ? 'allow-scripts allow-popups allow-forms'
              : 'allow-same-origin allow-scripts allow-popups allow-forms'
          }
        />
      }
      width="100%"
      height="100%"
      borderWidth={0}
      bg="var(--background)"
    />
  )
}

/** Shows or hides the summary above this conversation's browser. Exported for
 *  the conversation header, which is where the control belongs. */
export function usePinned(): [boolean, () => void] {
  const open = useOpen()
  const at = channel(open)
  const pane = usePane(at)
  return [pane.pinned, () => pin(at, !pane.pinned)]
}
