'use client'

// The reader's Recents in the column's mode, and only that mode's: Chat lists its
// conversations (`/v1/agents/chat/conversations`, `useThreadList`), Dev its
// coding runs (`/v1/agent/sessions?kind=coding`, @hanzo/build `useSessions`). Each
// mode reads its own store. The menu beside the heading narrows, groups and sorts
// the list; the choice is kept per mode in this browser. Chat's rows share one
// menu (thread.tsx `ConversationMenu`): pinned ones list first, under Pinned,
// and Chat's Status shows the archived ones apart.

import { useEffect, useId, useMemo, useRef } from 'react'
import { ScrollView, SizableText, XStack, YStack } from '@hanzo/gui'
import { ListFilter, MessageSquare } from 'lucide-react'
import type { Thread } from '@hanzo/ai'
import { DOTS, route, useSessions, type Host } from '@hanzo/build'
import { DropdownMenu, type DropdownMenuProps } from '@hanzo/ui'
import { SidebarItem, StatusDot } from '@hanzo/ui/chat'
import { useKept } from './kept'
import { ago, arrange, chats, MENUS, PLAIN, runs, SINCE, viewOf, type Mode, type Option, type Recent, type View } from './recent'
import { ConversationMenu, ThreadRow, useThreadList } from './thread'

/** The menu's items: each section a heading and its options, the one in force checked. */
function items(mode: Mode, view: View, set: (v: View) => void): NonNullable<DropdownMenuProps['items']> {
  const m = MENUS[mode]
  const section = <K extends keyof View>(key: K, label: string, options: Option<View[K]>[]): NonNullable<DropdownMenuProps['items']> =>
    options.length
      ? [
          { type: 'label', key: `${key}-label`, label },
          ...options.map((o) => ({
            key: `${key}-${String(o.id)}`,
            label: o.label,
            selected: view[key] === o.id,
            closeOnSelect: false,
            onSelect: () => set({ ...view, [key]: o.id }),
          })),
        ]
      : []
  const parts = [section('status', 'Status', m.status), section('since', 'Last activity', SINCE), section('group', 'Group by', m.group), section('sort', 'Sort by', m.sort)].filter(
    (p) => p.length,
  )
  return parts.flatMap((p, i) => (i ? [{ type: 'separator' as const, key: `sep-${i}` }, ...p] : p))
}

const Note = ({ children }: { children: string }) => (
  <SizableText size="$1" color="$soft" px="$2" py="$1.5">
    {children}
  </SizableText>
)

export function Recents({
  host,
  mode,
  thread,
  words,
  onOpen,
  onNew,
}: {
  host: Host
  mode: Mode
  /** The Chat conversation the pane holds, or null. */
  thread: string | null
  words: string
  onOpen: (r: Recent) => void
  /** Moves the pane to a new conversation: where it goes when the one it holds is deleted. */
  onNew: () => void
}) {
  const [kept, keep] = useKept<unknown>(`hanzo.recents.${mode}`, PLAIN)
  const view = viewOf(mode, kept)
  return mode === 'chat' ? (
    <Chats thread={thread} words={words} view={view} keep={keep} onOpen={onOpen} onNew={onNew} />
  ) : (
    <Runs host={host} words={words} view={view} keep={keep} onOpen={onOpen} />
  )
}

/** Chat's Recents: the conversation store alone, the archived ones when the view asks for them. */
function Chats({
  thread,
  words,
  view,
  keep,
  onOpen,
  onNew,
}: {
  thread: string | null
  words: string
  view: View
  keep: (v: View) => void
  onOpen: (r: Recent) => void
  onNew: () => void
}) {
  const store = useThreadList(view.status === 'archived', thread)
  const rows = useMemo(() => chats(store.threads), [store.threads])
  const byId = useMemo(() => new Map(store.threads.map((t) => [t.id, t])), [store.threads])
  return (
    <List
      mode="chat"
      rows={rows}
      words={words}
      view={view}
      keep={keep}
      open={(r) => r.id === thread}
      reading={store.loading && !store.threads.length}
      error={store.error}
      onOpen={onOpen}
      threads={byId}
      held={thread}
      onNew={onNew}
    />
  )
}

/** Dev's Recents: the org's coding runs alone. */
function Runs({ host, words, view, keep, onOpen }: { host: Host; words: string; view: View; keep: (v: View) => void; onOpen: (r: Recent) => void }) {
  const store = useSessions(host)
  const r = route(host.path)
  const run = r.kind === 'run' ? r.id : null
  // A run this list has not seen is one just begun: read the store again, once for it.
  const asked = useRef(new Set<string>())
  const reload = store.reload
  useEffect(() => {
    if (!run || store.loading || asked.current.has(run) || store.value.some((s) => s.id === run)) return
    asked.current.add(run)
    reload()
  }, [run, store.loading, store.value, reload])
  const rows = useMemo(() => runs(store.value), [store.value])
  return (
    <List
      mode="dev"
      rows={rows}
      words={words}
      view={view}
      keep={keep}
      open={(row) => row.id === run}
      reading={store.loading && !store.value.length}
      error={store.error}
      onOpen={onOpen}
    />
  )
}

function List({
  mode,
  rows,
  words,
  view,
  keep,
  open,
  reading,
  error,
  onOpen,
  threads,
  held = null,
  onNew,
}: {
  mode: Mode
  rows: Recent[]
  words: string
  view: View
  keep: (v: View) => void
  open: (r: Recent) => boolean
  reading: boolean
  error: Error | null | undefined
  onOpen: (r: Recent) => void
  /** Chat's conversations by id: a row of one carries its menu. */
  threads?: Map<string, Thread>
  /** The conversation the pane holds, listed or not: a deleted one leaves the list before the store answers. */
  held?: string | null
  /** Moves the pane to a new conversation: where it goes when the one it holds is deleted. */
  onNew?: () => void
}) {
  const label = useId()
  const groups = arrange(rows, view, words)
  const narrowed = view.status !== PLAIN.status || view.since !== PLAIN.since
  const now = new Date()
  const running = mode === 'dev' ? rows.filter((r) => r.status === 'running').length : 0
  const row = (r: Recent) => {
    const when = ago(r.at, now)
    const t = threads?.get(r.id)
    const item = (
        <SidebarItem
          data-kind={r.kind}
          active={open(r)}
          rounded="$4"
          minH={32}
          pr={when || t ? '$8' : '$2'}
          // A conversation's ⋯ is a thumb wide on a touch screen and always there: the title stops short of it.
          {...(t ? { $touchable: { pr: 52 } } : null)}
          onKeyDown={(e: { key?: string; preventDefault?: () => void }) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault?.()
            onOpen(r)
          }}
          icon={
            r.kind === 'chat' ? (
              <MessageSquare size={14} aria-hidden />
            ) : (
              <XStack width={14} justify="center">
                <StatusDot status={DOTS[r.status as keyof typeof DOTS] ?? 'idle'} />
              </XStack>
            )
          }
          onPress={() => onOpen(r)}
        >
          {r.title}
        </SidebarItem>
    )
    // How long ago, at the row's end; the full time is its title.
    const age = when ? (
      <SizableText size="$1" color="$soft" pointerEvents="none" display="flex" items="center" fontVariant={['tabular-nums']}>
        <time dateTime={r.at} title={new Date(r.at).toLocaleString()}>
          {when}
        </time>
      </SizableText>
    ) : null
    if (t)
      return (
        <ThreadRow key={r.id} t={t} active={open(r)} aside={age}>
          {item}
        </ThreadRow>
      )
    return (
      <YStack role="listitem" key={r.id} position="relative">
        {item}
        {age ? (
          <XStack position="absolute" r="$2" t={0} b={0} items="center" pointerEvents="none">
            {age}
          </XStack>
        ) : null}
      </YStack>
    )
  }

  const body = groups.length ? (
    <YStack role="list" aria-labelledby={label} gap={1}>
      {groups.map((g) =>
        g.title ? (
          <YStack role="listitem" key={g.title} gap={1} pt="$2">
            <SizableText size="$1" color="$soft" px="$2" pb="$1">
              {g.title}
            </SizableText>
            <YStack role="list" aria-label={g.title} gap={1}>
              {g.rows.map(row)}
            </YStack>
          </YStack>
        ) : (
          g.rows.map(row)
        ),
      )}
    </YStack>
  ) : reading ? (
    <Note>{mode === 'chat' ? 'Reading your chats…' : 'Reading your runs…'}</Note>
  ) : error ? null : words.trim() ? (
    <Note>{`Nothing matches “${words.trim()}”.`}</Note>
  ) : view.status === 'archived' ? (
    <Note>No archived chats.</Note>
  ) : narrowed ? (
    <Note>Nothing in this view.</Note>
  ) : (
    <Note>{mode === 'chat' ? 'No chats yet. Say something and it lands here.' : 'No runs yet.'}</Note>
  )

  return (
    <YStack data-slot="recents" flex={1} minH={0} mt="$2">
      <XStack items="center" justify="space-between" height={30} pl="$2" pr="$1" shrink={0}>
        <XStack items="center" gap="$2">
          <SizableText id={label} size="$1" color="$soft" fontWeight="600" textTransform="uppercase" letterSpacing={0.6}>
            Recents
          </SizableText>
          {running ? (
            // A count where there is one to keep an eye on: the runs still working.
            <XStack aria-label={`${running} running`} minW={18} height={18} px="$1.5" rounded={999} items="center" justify="center" bg="$edge" borderWidth={1} borderColor="$borderColor">
              <SizableText size="$1" fontWeight="600" color="$ink" aria-hidden>
                {String(running)}
              </SizableText>
            </XStack>
          ) : null}
        </XStack>
        <DropdownMenu
          minWidth={200}
          trigger={
            <XStack
              render="button"
              aria-label="Recents view"
              width={26}
              height={26}
              rounded="$2"
              items="center"
              justify="center"
              cursor="pointer"
              hoverStyle={{ bg: '$hover' }}
              bg={narrowed ? '$hover' : 'transparent'}
            >
              <ListFilter size={14} aria-hidden />
            </XStack>
          }
          items={items(mode, view, keep)}
        />
      </XStack>
      <ScrollView flex={1} showsVerticalScrollIndicator={false}>
        {error ? <Note>{error.message}</Note> : null}
        {threads ? (
          // Held while the list empties, so a dialog its last row opened closes in place.
          <ConversationMenu threads={threads} active={held} onGone={onNew}>
            <YStack>{body}</YStack>
          </ConversationMenu>
        ) : (
          body
        )}
      </ScrollView>
    </YStack>
  )
}
