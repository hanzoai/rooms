'use client'

// A conversation's own actions, kept where the conversation is: PATCH and DELETE
// /v1/agents/chat/conversations/{id} (hanzoai/agent v1.0.12), the member's own
// only — and the ones that need nothing of the store: its link, a new tab, the
// Share panel.
//
// ONE MENU A LIST. `ConversationMenu` wraps a list of rows and mounts, once for
// all of them, gui's ContextMenu (a right-click at the cursor, a long-press on
// touch), gui's Menu hung from whichever row's ⋯ was pressed (a gui Menu takes
// many triggers and anchors to the one pressed), and the Rename, Delete and
// Share dialogs. A row (`ThreadRow`) is its markup and a trigger. The column's
// Recents and the shell's /chat list both wrap theirs in it. Not
// @hanzo/ui/product/menu's ContextMenu: it portals its panel under gui's
// `pointer-events: none` host, so it drew and took no click (measured: every
// ancestor of its panel reads `none`).
//
// A CHANGE SHOWS AT ONCE, everywhere, and is taken back with a toast if the
// store refuses it (pending.ts): every list on the page draws the changes in
// flight over what it last read, and reads the store again once it answers.
// A pin is the server's, never this browser's: it follows the person to every
// device they sign in on.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { AiClient, Thread, ThreadChange } from '@hanzo/ai'
import { useAi } from '@hanzo/ai/react'
import { Archive, ArchiveRestore, ExternalLink, Link2, MoreHorizontal, Pencil, Pin, PinOff, Share2, Trash2 } from 'lucide-react'
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Input,
  SizableText,
  Text,
  XStack,
  YStack,
  toast,
} from '@hanzo/ui'
import { empty } from './open'
import { say } from './lib/org'
import { talk } from './lib/host'
import { BAD } from './lib/mix'
import { site } from './where'
import { attempt, bind, enlist, reread, snapshot, subscribe, sweep, tick, view, type Reader } from './pending'
import { chord, named, said, type Act } from './chord'
import { carry } from './stars'
import { ShareDialog } from './Share'

export interface ThreadList {
  threads: Thread[]
  loading: boolean
  error: Error | null
  reload: () => void
}

/**
 * The member's conversations: pinned first, then most recently spoken in, the
 * archived ones left out — or, with `archived`, those alone — with every change
 * in flight drawn over them. It reads again whenever a conversation changes
 * here, and once for `seek` when it does not hold it: a conversation it has not
 * seen is one just begun.
 */
export function useThreadList(archived = false, seek: string | null = null): ThreadList {
  const ai = useAi()
  // What was read, when, and from which shelf: the other shelf's rows are never drawn as this one's.
  const [read, setRead] = useState<{ threads: Thread[]; at: number; archived: boolean }>({ threads: [], at: 0, archived })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [asks, ask] = useState(0)
  const reload = useCallback(() => ask((n) => n + 1), [])
  const me = useRef<Reader>({ at: 0, reload })
  useEffect(() => enlist(me.current), [])
  useEffect(() => bind(ai), [ai])
  useEffect(() => {
    const control = new AbortController()
    const at = tick()
    setLoading(true)
    ai.threads.list({ archived, signal: control.signal }).then(
      (threads) => {
        if (control.signal.aborted) return
        me.current.at = at
        setRead({ threads, at, archived })
        setError(null)
        setLoading(false)
        sweep()
        // A read that answers is a client the store takes: the browser's old stars can become pins.
        stars(ai)
      },
      (e: unknown) => {
        if (control.signal.aborted) return
        setError(e instanceof Error ? e : new Error(String(e)))
        setLoading(false)
      },
    )
    return () => control.abort()
  }, [ai, archived, asks])
  const changes = useSyncExternalStore(subscribe, snapshot, snapshot)
  const threads = useMemo(() => (read.archived === archived ? view(read.threads, read.at, archived) : view([], 0, archived)), [read, archived, changes])
  const asked = useRef(new Set<string>())
  useEffect(() => {
    if (archived || !seek || loading || asked.current.has(seek) || threads.some((t) => t.id === seek)) return
    asked.current.add(seek)
    reload()
  }, [archived, seek, loading, threads, reload])
  return { threads, loading, error, reload }
}

/** How long a change waits for the store before it is taken back. */
const WAIT = 15_000

/** A refusal in the store's words, or that the store did not answer at all. */
const refused = (e: unknown): string =>
  e instanceof DOMException && e.name === 'TimeoutError' ? 'The conversation store did not answer. Try again.' : say(e)

let carried = false

/** The browser's stars from before pins were the server's, made pins once a page (stars.ts `carry`). */
function stars(ai: AiClient): void {
  if (carried) return
  carried = true
  void carry((id) => ai.threads.update(id, { pinned: true }, { signal: AbortSignal.timeout(WAIT) })).then((done) => {
    if (done) reread()
  })
}

/** What a conversation can be asked to do. Each shows at once; a refusal takes it back and says so in a toast. */
export function useThreadActions() {
  const ai = useAi()
  return useMemo(() => {
    const run = async (t: Thread, change: ThreadChange | null, send: (signal: AbortSignal) => Promise<Thread | void>): Promise<boolean> => {
      try {
        // The clock starts when the change is asked, after the ones before it are answered.
        await attempt(t, change, () => send(AbortSignal.timeout(WAIT)))
        return true
      } catch (e) {
        toast.error(refused(e))
        return false
      }
    }
    const change = (t: Thread, to: ThreadChange) => run(t, to, (signal) => ai.threads.update(t.id, to, { signal }))
    return {
      pin: (t: Thread) => change(t, { pinned: !t.pinned }),
      archive: (t: Thread) => change(t, { archived: !t.archived }),
      rename: (t: Thread, title: string) => change(t, { title }),
      remove: (t: Thread) => run(t, null, (signal) => ai.threads.remove(t.id, { signal })),
    }
  }, [ai])
}

const titleOf = (t: Thread) => t.title || 'Untitled'

/** A conversation's own address, whole: the app at `/?chat=<id>` (lib/host `talk`), wherever the rooms are drawn. */
export const href = (id: string): string => new URL(site(talk(id)), window.location.href).href

/** Opens a conversation in a tab of its own. */
const away = (id: string): void => {
  window.open(href(id), '_blank', 'noopener')
}

/** Puts a conversation's address on the clipboard. */
async function copy(id: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(href(id))
    toast.success('Link copied')
  } catch {
    toast.error('The browser would not copy the link.')
  }
}

/** The one colour in the menu: Delete's — design's destructive mixed toward the theme's ink, 4.5:1 on either theme's panel. */
const DANGER = BAD

const mac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

type Dialogue = 'rename' | 'delete' | 'share'

/** What a row needs of the list's menu. */
interface Menus {
  /** The conversation the ⋯ that was just pressed belongs to, and the ⋯. */
  aim: (t: Thread, from: HTMLElement) => void
  /** The conversation whose menu is open, or null. */
  open: string | null
}

const Rows = createContext<Menus | null>(null)

/** One entry of the menu: an act — its keys printed, and named for assistive technology — or the line before Delete. */
type Entry =
  | { key: string; label: string; icon: ReactNode; shortcut?: string; keys?: string; destructive?: boolean; run: () => void }
  | { key: string; line: true }

/** The keys of every list's menu on the page, heard once (`chord`). */
interface Keys {
  /** Whether this list's menu is open. */
  open: boolean
  /** Whether one of this list's dialogs is: the keys are the dialog's then. */
  held: boolean
  /** The conversation the keys act on here: the one whose menu is open, or the one the pane holds. */
  target: () => Thread | null
  act: (a: Act, t: Thread) => void
}

const keyed = new Set<{ current: Keys | null }>()

/**
 * A keydown anywhere on the page, before anything inside it handles it (an
 * open menu takes its keys): the list whose menu is open, or else the first
 * that holds the open conversation, acts.
 */
function hear(e: KeyboardEvent): void {
  const act = chord(e)
  if (!act) return
  const all = [...keyed].map((one) => one.current).filter((one): one is Keys => one !== null)
  if (all.some((one) => one.held)) return
  const list = all.find((one) => one.open) ?? all.find((one) => one.target() !== null)
  const t = list?.target()
  if (!list || !t) return
  e.preventDefault()
  list.act(act, t)
}

function listen(keys: { current: Keys | null }): () => void {
  if (!keyed.size) window.addEventListener('keydown', hear, true)
  keyed.add(keys)
  return () => {
    keyed.delete(keys)
    if (!keyed.size) window.removeEventListener('keydown', hear, true)
  }
}

/** The element of a row that takes focus: the row itself, a button. */
const own = (row: Element | null): HTMLElement | null => row?.querySelector<HTMLElement>('[data-slot="sidebar-item"], [role="button"]') ?? null

/**
 * A list of conversations with their menu: a right-click on a row or a
 * long-press opens it at the point, a row's ⋯ hangs it from itself. Its one
 * child holds the rows (`ThreadRow`). `threads` are the list's conversations by
 * id, `active` the one the pane holds (what the keys act on with no menu open),
 * and `onGone` runs after that one is deleted — the room moves to a new chat —
 * defaulting to emptying the room.
 */
export function ConversationMenu({
  threads,
  active = null,
  onGone = empty,
  children,
}: {
  threads: Map<string, Thread>
  active?: string | null
  onGone?: () => void
  children: ReactElement
}) {
  const act = useThreadActions()
  // The conversation the pane holds NOW: a delete answered after the reader moved on leaves the room they moved to.
  const holds = useRef(active)
  holds.current = active
  // The list's own element, for the row after one deleted.
  const list = useId()
  const [menu, setMenu] = useState<'point' | 'dots' | null>(null)
  const [dialogue, setDialogue] = useState<Dialogue | null>(null)
  // The conversation the menu or a dialog acts on, by id, read from the list so
  // it is current; the last one read stands in once the list lets it go (a
  // closing Delete dialog still names it).
  const [aimed, setAimed] = useState<string | null>(null)
  const last = useRef<Thread | null>(null)
  const listed = aimed ? (threads.get(aimed) ?? null) : null
  if (listed) last.current = listed
  const subject = aimed ? (listed ?? (last.current?.id === aimed ? last.current : null)) : null
  // Where focus goes back to: the ⋯ pressed, or the row right-clicked.
  const from = useRef<HTMLElement | null>(null)
  // What a right-click or a long-press landed on, before the menu decides to open.
  const pointed = useRef<Thread | null>(null)

  const ask = useCallback((d: Dialogue, t: Thread) => {
    setAimed(t.id)
    setMenu(null)
    setDialogue(d)
  }, [])

  const aim = useCallback((t: Thread, el: HTMLElement) => {
    from.current = el
    setAimed(t.id)
  }, [])

  const point = (e: { target: EventTarget | null }) => {
    const row = (e.target as Element | null)?.closest?.('[data-thread]') ?? null
    pointed.current = row ? (threads.get(row.getAttribute('data-thread') ?? '') ?? null) : null
    if (pointed.current) from.current = own(row)
  }

  // A menu shut by Escape, a choice or a press outside gives focus back where it
  // was opened from — unless what was chosen opened a dialog, which takes it.
  const back = (e: Event) => {
    e.preventDefault()
    requestAnimationFrame(() => {
      const now = document.activeElement
      if (!now || now === document.body) from.current?.focus()
    })
  }
  const shut = (open: boolean) => {
    if (!open) setDialogue(null)
  }
  const after = (e: Event) => {
    e.preventDefault()
    if (from.current?.isConnected) from.current.focus()
  }

  const keys = useRef<Keys | null>(null)
  keys.current = {
    open: menu !== null,
    held: dialogue !== null,
    target: () => (menu !== null ? subject : active ? (threads.get(active) ?? null) : null),
    act: (a, t) => {
      // With no menu open, focus goes back to wherever the keys were pressed.
      if (menu === null && document.activeElement instanceof HTMLElement) from.current = document.activeElement
      if (a === 'rename') return ask('rename', t)
      setMenu(null)
      void act.pin(t)
    },
  }
  useEffect(() => listen(keys), [])

  const rows = useMemo<Menus>(() => ({ aim, open: menu ? aimed : null }), [aim, menu, aimed])

  // The menu is named by its conversation: gui would name it by its trigger, the
  // list itself for a right-click, and the ⋯ for the other.
  const title = subject ? titleOf(subject) : undefined
  const apple = mac()
  const entries: Entry[] = subject
    ? [
        {
          key: 'rename',
          label: 'Rename',
          icon: <Pencil size={16} aria-hidden />,
          shortcut: said('rename', apple),
          keys: named('rename'),
          run: () => ask('rename', subject),
        },
        {
          key: 'pin',
          label: subject.pinned ? 'Unpin' : 'Pin',
          icon: subject.pinned ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />,
          shortcut: said('pin', apple),
          keys: named('pin'),
          run: () => void act.pin(subject),
        },
        { key: 'share', label: 'Share…', icon: <Share2 size={16} aria-hidden />, run: () => ask('share', subject) },
        { key: 'copy', label: 'Copy link', icon: <Link2 size={16} aria-hidden />, run: () => void copy(subject.id) },
        { key: 'tab', label: 'Open in new tab', icon: <ExternalLink size={16} aria-hidden />, run: () => away(subject.id) },
        {
          key: 'archive',
          label: subject.archived ? 'Unarchive' : 'Archive',
          icon: subject.archived ? <ArchiveRestore size={16} aria-hidden /> : <Archive size={16} aria-hidden />,
          run: () => void act.archive(subject),
        },
        { key: 'gone', line: true },
        { key: 'delete', label: 'Delete', icon: <Trash2 size={16} color={DANGER} aria-hidden />, destructive: true, run: () => ask('delete', subject) },
      ]
    : []

  return (
    <Rows.Provider value={rows}>
      <DropdownMenu open={menu === 'dots'} onOpenChange={(open) => setMenu(open ? 'dots' : null)}>
        <ContextMenu
          // Held here as well as inside gui's ContextMenu, so the keys can shut it.
          open={menu === 'point'}
          onOpenChange={(open, e) => {
            if (!open) return setMenu((m) => (m === 'point' ? null : m))
            // Not on a conversation: the browser's own menu answers.
            if (!pointed.current) return e?.preventDefault()
            setAimed(pointed.current.id)
            setMenu('point')
          }}
        >
          <ContextMenuTrigger
            asChild
            data-menu={list}
            onContextMenu={point}
            onPointerDown={(e: { pointerType?: string; target: EventTarget | null }) => {
              if (e.pointerType !== 'mouse') point(e)
            }}
          >
            {children}
          </ContextMenuTrigger>
          <ContextMenuContent minW={220} onCloseAutoFocus={back} aria-labelledby={undefined} aria-label={title}>
            {entries.map((one) =>
              'line' in one ? (
                <ContextMenuSeparator key={one.key} />
              ) : (
                <ContextMenuItem key={one.key} variant={one.destructive ? 'destructive' : 'default'} aria-keyshortcuts={one.keys} onSelect={one.run}>
                  <Face entry={one} Shortcut={ContextMenuShortcut} />
                </ContextMenuItem>
              ),
            )}
          </ContextMenuContent>
        </ContextMenu>
        <DropdownMenuContent align="end" minW={220} onCloseAutoFocus={back} aria-labelledby={undefined} aria-label={title}>
          {entries.map((one) =>
            'line' in one ? (
              <DropdownMenuSeparator key={one.key} />
            ) : (
              <DropdownMenuItem key={one.key} variant={one.destructive ? 'destructive' : 'default'} aria-keyshortcuts={one.keys} onSelect={one.run}>
                <Face entry={one} Shortcut={DropdownMenuShortcut} />
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Rename
        t={subject}
        open={dialogue === 'rename'}
        onOpenChange={shut}
        onCloseAutoFocus={after}
        save={(t, words) => {
          if (words !== titleOf(t)) void act.rename(t, words)
        }}
      />
      <Delete
        t={subject}
        open={dialogue === 'delete'}
        onOpenChange={shut}
        onCloseAutoFocus={after}
        remove={(t) => {
          // Focus goes on to the row after it, or the one before, not to the page.
          const rows = [...(document.querySelector(`[data-menu="${list}"]`)?.querySelectorAll('[data-thread]') ?? [])]
          const at = rows.findIndex((row) => row.getAttribute('data-thread') === t.id)
          if (at >= 0) from.current = own(rows[at + 1] ?? rows[at - 1] ?? null)
          void act.remove(t).then((ok) => {
            if (ok && holds.current === t.id) onGone()
          })
        }}
      />
      <ShareDialog thread={subject?.id ?? null} open={dialogue === 'share'} onOpenChange={shut} onCloseAutoFocus={after} />
    </Rows.Provider>
  )
}

/** One entry's line: its icon in a 16px well, its name, and its keys at the end. */
function Face({
  entry,
  Shortcut,
}: {
  entry: Extract<Entry, { run: () => void }>
  Shortcut: typeof ContextMenuShortcut | typeof DropdownMenuShortcut
}) {
  return (
    <>
      <XStack width={16} height={16} items="center" justify="center" shrink={0}>
        {entry.icon}
      </XStack>
      <Text flex={1} minW={0} fontSize="$2" color={entry.destructive ? DANGER : '$ink'} numberOfLines={1}>
        {entry.label}
      </Text>
      {/* Printed for the eye; the item's aria-keyshortcuts says it to assistive technology. */}
      {entry.shortcut ? <Shortcut aria-hidden>{entry.shortcut}</Shortcut> : null}
    </>
  )
}

/**
 * One conversation's row, inside a `ConversationMenu`: its menu opens by a
 * right-click anywhere on it, a long-press, or its ⋯; a middle-click or a
 * ⌘/Ctrl-click opens it in a new tab.
 *
 * The ⋯ stands where `aside` (the row's age) stands, and takes its place while
 * the row is hovered, focused, open in the pane or has its menu open, and
 * always on a touch screen, which has no hover to find it by; the rest of the
 * time the age reads there.
 */
export function ThreadRow({
  t,
  active = false,
  aside,
  listed = true,
  children,
}: {
  t: Thread
  active?: boolean
  aside?: ReactNode
  /** A row of a list (`role="listitem"`); false where it stands among other rows. */
  listed?: boolean
  children: ReactElement
}) {
  const menus = useContext(Rows)
  if (!menus) throw new Error('ThreadRow is drawn inside a ConversationMenu, which holds its menu.')
  const [focused, setFocused] = useState(false)
  // Its own id: gui gives every trigger of one menu the menu's one id.
  const id = useId()
  // What the ⋯ is for, said after its name: the row's title.
  const about = useId()
  // The ⋯ and the age share one place: whichever shows, the other gives way.
  const shown = active || menus.open === t.id || focused
  // gui types these handlers by React Native's event; on the web they carry the DOM's.
  const aim = (e: unknown) => menus.aim(t, (e as MouseEvent<HTMLElement>).currentTarget)
  // A new tab for the row itself, never for its ⋯.
  const onDots = (target: EventTarget | null) => Boolean((target as Element | null)?.closest?.('[data-slot="thread-options"]'))
  return (
    <YStack
      {...(listed ? { role: 'listitem' } : null)}
      position="relative"
      group
      data-thread={t.id}
      data-pinned={t.pinned ? '' : undefined}
      onClickCapture={(press: unknown) => {
        const e = press as MouseEvent<HTMLElement>
        if (!(e.metaKey || e.ctrlKey) || onDots(e.target)) return
        e.preventDefault()
        e.stopPropagation()
        away(t.id)
      }}
      onMouseDown={(e: MouseEvent<HTMLElement>) => {
        // The middle button's own autoscroll would start here.
        if (e.button === 1) e.preventDefault()
      }}
      onMouseUp={(e: MouseEvent<HTMLElement>) => {
        if (e.button !== 1 || onDots(e.target)) return
        e.preventDefault()
        away(t.id)
      }}
    >
      {children}
      <Text id={about} display="none">
        {titleOf(t)}
      </Text>
      {aside ? (
        <XStack
          position="absolute"
          r="$2"
          t={0}
          b={0}
          items="center"
          pointerEvents="none"
          opacity={shown ? 0 : 1}
          $group-hover={{ opacity: 0 }}
          $touchable={{ opacity: 0 }}
        >
          {aside}
        </XStack>
      ) : null}
      <XStack position="absolute" r="$1" t={0} b={0} items="center">
        <DropdownMenuTrigger asChild>
          <XStack
            render="button"
            // Named for what it is, not for the row: the row's own name is its title,
            // and a second button named with that title would answer for it too.
            aria-label="Chat options"
            aria-describedby={about}
            id={id}
            data-slot="thread-options"
            width={26}
            height={26}
            rounded="$2"
            items="center"
            justify="center"
            cursor="pointer"
            bg="transparent"
            opacity={shown ? 1 : 0}
            $group-hover={{ opacity: 1 }}
            // A thumb's 44px on a touch screen (lib/tap.ts), centred on the row and over its edges.
            $touchable={{ opacity: 1, minW: 44, minH: 44 }}
            hoverStyle={{ bg: '$hover' }}
            // Before gui's own press handler, which opens the menu and stops there.
            onPointerDownCapture={aim}
            onKeyDownCapture={aim}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          >
            <MoreHorizontal size={15} aria-hidden />
          </XStack>
        </DropdownMenuTrigger>
      </XStack>
    </YStack>
  )
}

/** A conversation's title, written again: one line, never empty. */
function Rename({
  t,
  open,
  onOpenChange,
  onCloseAutoFocus,
  save,
}: {
  t: Thread | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (e: Event) => void
  save: (t: Thread, title: string) => void
}) {
  const [words, setWords] = useState('')
  // The title as it stood when the dialog opened; a list read again meanwhile does not overwrite the typing.
  const id = t?.id
  useEffect(() => {
    if (open && t) setWords(titleOf(t))
  }, [open, id])
  const submit = () => {
    const title = words.trim()
    // Once: a second Enter while the dialog closes asks nothing.
    if (!open || !title || !t) return
    onOpenChange(false)
    save(t, title)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={440} rounded="$6" gap="$3" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogTitle>Rename chat</DialogTitle>
        <Input
          autoFocus
          value={words}
          onChangeText={setWords}
          aria-label="Chat title"
          maxLength={80}
          onKeyDown={(e: { key?: string; keyCode?: number; nativeEvent?: { isComposing?: boolean } }) => {
            // An Enter that ends an IME composition writes the word; it does not save.
            if (e.key === 'Enter' && !e.nativeEvent?.isComposing && e.keyCode !== 229) submit()
          }}
        />
        <XStack gap="$2" justify="flex-end">
          <Button size="sm" variant="outline" rounded={999} onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" rounded={999} disabled={!words.trim()} onPress={submit}>
            Save
          </Button>
        </XStack>
      </DialogContent>
    </Dialog>
  )
}

/** Deleting asks first, and says what goes with it: every turn, and every link it was shared by. */
function Delete({
  t,
  open,
  onOpenChange,
  onCloseAutoFocus,
  remove,
}: {
  t: Thread | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (e: Event) => void
  remove: (t: Thread) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={440} rounded="$6" gap="$3" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogTitle>Delete chat?</DialogTitle>
        <SizableText size="$2" color="$soft">
          {`“${t ? titleOf(t) : ''}” is deleted for good, with every link it was shared by. To keep it out of the list instead, archive it.`}
        </SizableText>
        <XStack gap="$2" justify="flex-end">
          <Button size="sm" variant="outline" rounded={999} onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            rounded={999}
            disabled={!t}
            onPress={() => {
              // Once: a second press while the dialog closes would ask the store to delete it again.
              if (!open || !t) return
              onOpenChange(false)
              remove(t)
            }}
          >
            Delete
          </Button>
        </XStack>
      </DialogContent>
    </Dialog>
  )
}
