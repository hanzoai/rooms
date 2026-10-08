'use client'

// A conversation's own actions — pin, rename, archive, delete — kept where the
// conversation is: PATCH and DELETE /v1/agent/chat/conversations/{id}
// (hanzoai/agent v1.0.12), the member's own only. One menu, two ways in: a
// right-click on the row opens it at the cursor (gui's ContextMenu), and the
// row's ⋯ hangs it from itself (gui's DropdownMenu), which a keyboard reaches.
// One list of items feeds both. Not @hanzo/ui/product/menu's ContextMenu: it
// portals its panel under gui's `pointer-events: none` host, so it drew and took
// no click (measured: every ancestor of its panel reads `none`).
//
// EVERY LIST ON THE PAGE READS AGAIN WHEN ONE CONVERSATION CHANGES, so the
// column's Recents, the rooms' shell and the conversation's own header agree
// without a second copy of anyone's pins. A pin is the server's, never this
// browser's: it follows the person to every device they sign in on.

import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { Thread } from '@hanzo/ai'
import { useAi, useThreads } from '@hanzo/ai/react'
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  Input,
  SizableText,
  XStack,
  YStack,
  toast,
} from '@hanzo/ui'
import type { MenuItemSpec } from '@hanzo/ui/product/menu/items'
import { empty, useOpen } from './open'
import { say } from './lib/org'

const lists = new Set<() => void>()

/** Every list of conversations on the page reads again. */
const changed = () => lists.forEach((reload) => reload())

/**
 * The member's conversations: pinned first, then most recently spoken in, the
 * archived ones left out — or, with `archived`, those alone. It reads again
 * whenever a conversation changes here, and once for `seek` when it does not
 * hold it: a conversation it has not seen is one just begun.
 */
export function useThreadList(archived = false, seek: string | null = null): ReturnType<typeof useThreads> {
  const store = useThreads({ archived })
  const { reload, loading, threads } = store
  useEffect(() => {
    lists.add(reload)
    return () => {
      lists.delete(reload)
    }
  }, [reload])
  const asked = useRef(new Set<string>())
  useEffect(() => {
    if (archived || !seek || loading || asked.current.has(seek) || threads.some((t) => t.id === seek)) return
    asked.current.add(seek)
    reload()
  }, [archived, seek, loading, threads, reload])
  return store
}

/** What a conversation can be asked to do. Each reports a failure in a toast, in its own words. */
export function useThreadActions() {
  const ai = useAi()
  const run = useCallback(async (work: () => Promise<unknown>): Promise<boolean> => {
    try {
      await work()
      changed()
      return true
    } catch (e) {
      toast.error(say(e))
      return false
    }
  }, [])
  return {
    pin: (t: Thread) => run(() => ai.threads.update(t.id, { pinned: !t.pinned })),
    archive: (t: Thread) => run(() => ai.threads.update(t.id, { archived: !t.archived })),
    rename: (t: Thread, title: string) => run(() => ai.threads.update(t.id, { title })),
    remove: (t: Thread) => run(() => ai.threads.remove(t.id)),
  }
}

const titleOf = (t: Thread) => t.title || 'Untitled'

/**
 * One conversation's row with its menu: a right-click anywhere on it, or its ⋯.
 *
 * The ⋯ stands where `aside` (the row's age) stands, and takes its place while
 * the row is hovered, focused, open in the pane or has its menu open; the rest
 * of the time the age reads there. `onGone` runs after the conversation the
 * pane holds is deleted — the column moves to a new chat — and defaults to
 * emptying the room.
 */
export function ThreadRow({
  t,
  active = false,
  aside,
  onGone = empty,
  listed = true,
  children,
}: {
  t: Thread
  active?: boolean
  aside?: ReactNode
  onGone?: () => void
  /** A row of a list (`role="listitem"`); false where it stands among other rows. */
  listed?: boolean
  children: ReactElement
}) {
  const act = useThreadActions()
  const { thread } = useOpen()
  const [menu, setMenu] = useState(false)
  const [focused, setFocused] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const items: MenuItemSpec[] = [
    {
      key: 'pin',
      label: t.pinned ? 'Unpin' : 'Pin',
      icon: t.pinned ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />,
      onSelect: () => void act.pin(t),
    },
    { key: 'rename', label: 'Rename', icon: <Pencil size={16} aria-hidden />, onSelect: () => setRenaming(true) },
    {
      key: 'archive',
      label: t.archived ? 'Unarchive' : 'Archive',
      icon: t.archived ? <ArchiveRestore size={16} aria-hidden /> : <Archive size={16} aria-hidden />,
      onSelect: () => void act.archive(t),
    },
    { type: 'separator', key: 'gone' },
    { key: 'delete', label: 'Delete', icon: <Trash2 size={16} aria-hidden />, destructive: true, onSelect: () => setDeleting(true) },
  ]
  // The ⋯ and the age share one place: whichever shows, the other gives way.
  const shown = active || menu || focused
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <YStack {...(listed ? { role: 'listitem' } : null)} position="relative" group data-thread={t.id} data-pinned={t.pinned ? '' : undefined}>
            {children}
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
              >
                {aside}
              </XStack>
            ) : null}
            <XStack position="absolute" r="$1" t={0} b={0} items="center">
              <DropdownMenu
                open={menu}
                onOpenChange={setMenu}
                minWidth={180}
                items={items}
                trigger={
                  <XStack
                    render="button"
                    // Named for what it is, not for the row: the row's own name is its title,
                    // and a second button named with that title would answer for it too.
                    aria-label="Chat options"
                    aria-haspopup="menu"
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
                    hoverStyle={{ bg: '$hover' }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                  >
                    <MoreHorizontal size={15} aria-hidden />
                  </XStack>
                }
              />
            </XStack>
          </YStack>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {items.map((one, i) =>
            one.type === 'separator' ? (
              <ContextMenuSeparator key={one.key ?? i} />
            ) : one.type === 'label' ? null : (
              <ContextMenuItem key={one.key} variant={one.destructive ? 'destructive' : 'default'} onSelect={one.onSelect}>
                {one.icon}
                {one.label}
              </ContextMenuItem>
            ),
          )}
        </ContextMenuContent>
      </ContextMenu>
      <Rename t={t} open={renaming} onOpenChange={setRenaming} save={(words) => act.rename(t, words)} />
      <Delete
        t={t}
        open={deleting}
        onOpenChange={setDeleting}
        remove={async () => {
          const ok = await act.remove(t)
          if (ok && thread === t.id) onGone()
          return ok
        }}
      />
    </>
  )
}

/** A conversation's title, written again: one line, never empty. */
function Rename({
  t,
  open,
  onOpenChange,
  save,
}: {
  t: Thread
  open: boolean
  onOpenChange: (open: boolean) => void
  save: (title: string) => Promise<boolean>
}) {
  const [words, setWords] = useState(titleOf(t))
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setWords(titleOf(t))
  }, [open, t])
  const submit = async () => {
    const title = words.trim()
    if (!title || busy) return
    setBusy(true)
    if (await save(title)) onOpenChange(false)
    setBusy(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={440} rounded="$6" gap="$3">
        <DialogTitle>Rename chat</DialogTitle>
        <Input
          autoFocus
          value={words}
          onChangeText={setWords}
          aria-label="Chat title"
          maxLength={80}
          onKeyDown={(e: { key?: string }) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        <XStack gap="$2" justify="flex-end">
          <Button size="sm" variant="outline" rounded={999} onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" rounded={999} disabled={busy || !words.trim()} onPress={() => void submit()}>
            {busy ? 'Saving…' : 'Save'}
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
  remove,
}: {
  t: Thread
  open: boolean
  onOpenChange: (open: boolean) => void
  remove: () => Promise<boolean>
}) {
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (busy) return
    setBusy(true)
    if (await remove()) onOpenChange(false)
    setBusy(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={440} rounded="$6" gap="$3">
        <DialogTitle>Delete chat?</DialogTitle>
        <SizableText size="$2" color="$soft">
          {`“${titleOf(t)}” is deleted for good, with every link it was shared by. To keep it out of the list instead, archive it.`}
        </SizableText>
        <XStack gap="$2" justify="flex-end">
          <Button size="sm" variant="outline" rounded={999} onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" rounded={999} disabled={busy} onPress={() => void submit()}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </XStack>
      </DialogContent>
    </Dialog>
  )
}

