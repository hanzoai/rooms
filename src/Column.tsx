'use client'

// The app's one column, the same in both modes: the Chat / Dev switch, a filter,
// New, Dev's places, the Recents of the mode it is in, and at the foot the
// account (components/workspace/Me.tsx).
//
// It is a pane on the frame's ground (app/_web.tsx), sized by the edge in the
// gutter to its right: dragged, keyed or double-clicked back (@hanzo/build's
// `Grip`), kept per browser. Pulled in past its floor it collapses to a rail of
// marks, kept under the key the builder's rail kept it under, so a reader's
// choice outlives the move.

import { Text, XStack, YStack } from '@hanzo/gui'
import { ChevronDown, ChevronUp, PanelLeft, Plus, Search } from 'lucide-react'
import { Grip, nav, route, type Host } from '@hanzo/build'
import { Sidebar, SidebarIconButton, SidebarItem } from '@hanzo/ui/chat'
import { HanzoMark } from '@hanzogui/shell'
import { useState } from 'react'
import { ModeMark } from './ModeMark'
import { useKept } from './kept'
import { Made, Me } from './Me'
import { Recents } from './Recents'
import { Setup } from './Setup'
import type { Mode, Recent } from './recent'
import { empty } from './open'
import { useSpan } from './span'
import { pane } from './ground'
import { pick } from './lib/session'
import { app, talk } from './lib/host'
import { brand } from './where'

/** The grip stands in the gutter between the column and the pane. gui carries a `calc()` to the page unchanged; its
 *  types only name custom properties. */
const GUTTER_END = 'calc(-1 * var(--pane-gap))' as `var(--${string})`
/** The sidebar fills the column. Its `width` is typed in px alone, though its frame takes any gui size — the type is
 *  @hanzo/ui's to widen. */
const FILL = { width: '100%' } as object

/** The column's width, px: its default, and the two a drag holds it between. */
const WIDTH = 272
const FLOOR = 220
const CEIL = 420
/** The collapsed rail's width, px. */
const RAIL = 60
/** Per reader, per browser. */
const SPAN = 'hanzo.app.column'

/** Enter and Space press a row the way a click does. */
const keys = (press: () => void) => ({
  onKeyDown: (e: { key?: string; preventDefault?: () => void }) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault?.()
    press()
  },
})

/** A row of the column: a pill, lit where the reader is. */
const ROW = { rounded: '$4', minH: 34 } as const

export function Column({
  host,
  mode,
  thread,
  onChat,
  onDev,
  go,
  drawer = false,
}: {
  host: Host
  mode: Mode
  /** The Chat conversation the pane holds, or null. */
  thread: string | null
  /** The switch: to Chat and to Dev, each where the reader left it. */
  onChat: () => void
  onDev: () => void
  /** Moves the app to an address of this page. */
  go: (address: string) => void
  /** Drawn in the phone's drawer: no collapse, no edge, always open. */
  drawer?: boolean
}) {
  const [kept, setCollapsed] = useKept('hanzo.build.rail', false)
  const collapsed = kept && !drawer
  const [unfolded, setUnfolded] = useState(false)
  const [words, setWords] = useState('')
  const span = useSpan(SPAN, WIDTH, FLOOR, CEIL)

  const dev = (p: string) => host.go(p)
  const r = route(host.path)
  const fresh = mode === 'chat' ? !thread : r.kind === 'new'
  const { links, more } = nav(host, dev)
  const open = (row: Recent) => (row.kind === 'chat' ? go(talk(row.id)) : dev(row.id))
  const create = () => {
    if (mode === 'dev') return dev('')
    empty()
    go(talk())
  }
  // Another organization: picked, and the app opened in it at the mode's New.
  const org = (o: string) => {
    pick(o)
    window.location.assign(mode === 'dev' ? app('') : talk())
  }

  if (collapsed)
    return (
      <YStack data-slot="app-column" data-collapsed="" position="relative" shrink={0} width={RAIL} $max-md={{ display: 'none' }}>
        <Sidebar
          data-slot="app-rail"
          data-collapsed="true"
          role="navigation"
          aria-label={brand()}
          {...pane()}
          {...FILL}
          px="$1.5"
          py="$2.5"
          gap="$1.5"
          items="center"
        >
          <SidebarIconButton label="Expand sidebar" onPress={() => setCollapsed(false)} width={36} height={36} rounded={999}>
            <PanelLeft size={16} />
          </SidebarIconButton>
          <ModeMark mode={mode} onChat={onChat} onDev={onDev} stacked />
          <SidebarIconButton label={mode === 'chat' ? 'New chat' : 'New run'} onPress={create} width={36} height={36} rounded={999}>
            <Plus size={16} />
          </SidebarIconButton>
          <YStack flex={1} />
          <Me host={host} narrow onOrg={org} />
        </Sidebar>
      </YStack>
    )

  return (
    <YStack
      data-slot="app-column"
      ref={drawer ? undefined : span.ref}
      // inline-style: `--span`, the width a drag rewrites on the element itself (span.ts); no prop sets a variable.
      style={drawer ? undefined : span.style}
      position="relative"
      shrink={0}
      height="100%"
      width={drawer ? '100%' : 'var(--span)'}
      {...(drawer ? {} : { '$max-md': { display: 'none' } })}
    >
      <Sidebar
        data-slot="app-rail"
        data-collapsed="false"
        role="navigation"
        aria-label={brand()}
        {...pane()}
        {...FILL}
        px="$2.5"
        pt="$3"
        pb="$2"
        gap="$0"
      >
        <XStack data-slot="mode-switch" items="center" gap="$2" px="$1.5" pb="$3" minW={0}>
          <HanzoMark size={18} />
          <ModeMark mode={mode} onChat={onChat} onDev={onDev} />
        </XStack>
        <XStack data-slot="app-filter" items="center" gap="$2" px="$3" height={36} rounded={999} borderWidth={1} borderColor="$borderColor" bg="$edge" shrink={0}>
          <Search size={15} aria-hidden color="var(--soft, var(--muted-foreground))" />
          <Text
            render={
              <input
                value={words}
                onChange={(e) => setWords(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setWords('')
                }}
                placeholder="Filter"
                aria-label="Filter recents"
              />
            }
            flex={1}
            minW={0}
            bg="transparent"
            borderWidth={0}
            outlineStyle="none"
            color="inherit"
            fontSize="$2"
          />
        </XStack>
        <YStack role="list" mt="$2.5" gap={2} shrink={0}>
          <YStack role="listitem">
            <SidebarItem data-slot="app-new" {...ROW} active={fresh} icon={<Plus size={16} aria-hidden />} onPress={create} {...keys(create)}>
              {mode === 'chat' ? 'New chat' : 'New run'}
            </SidebarItem>
          </YStack>
          {mode === 'dev'
            ? links.map((link) => (
                <YStack role="listitem" key={link.id}>
                  <SidebarItem {...ROW} active={link.active} icon={link.icon} onPress={link.onPress} {...keys(() => link.onPress?.())}>
                    {link.label}
                  </SidebarItem>
                </YStack>
              ))
            : null}
          {mode === 'dev' ? (
            <YStack role="listitem">
              <SidebarItem
                {...ROW}
                aria-expanded={unfolded}
                icon={unfolded ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
                onPress={() => setUnfolded((v) => !v)}
                {...keys(() => setUnfolded((v) => !v))}
              >
                More
              </SidebarItem>
              {unfolded ? (
                <YStack role="list" gap={2}>
                  {more.map((link) => (
                    <YStack role="listitem" key={link.id}>
                      <SidebarItem {...ROW} active={link.active} icon={link.icon} onPress={link.onPress} {...keys(() => link.onPress?.())}>
                        {link.label}
                      </SidebarItem>
                    </YStack>
                  ))}
                </YStack>
              ) : null}
            </YStack>
          ) : null}
        </YStack>
        <XStack height={1} bg="$borderColor" mx="$1.5" mt="$3" shrink={0} />
        <Recents host={host} mode={mode} thread={thread} words={words} onOpen={open} onNew={create} />
        <YStack gap="$2" pt="$2" shrink={0}>
          <Made />
          <Setup />
        </YStack>
        <XStack data-slot="app-foot" items="center" gap="$1" pt="$2" shrink={0}>
          <YStack flex={1} minW={0}>
            <Me host={host} onOrg={org} />
          </YStack>
          {drawer ? null : (
            <SidebarIconButton label="Collapse sidebar" onPress={() => setCollapsed(true)} width={32} height={32} rounded={999}>
              <PanelLeft size={16} />
            </SidebarIconButton>
          )}
        </XStack>
      </Sidebar>
      {drawer ? null : (
        <Grip
          side="left"
          span={span.span}
          floor={FLOOR}
          ceil={CEIL}
          reset={WIDTH}
          onSpan={span.move}
          onKeep={span.keep}
          onShut={() => setCollapsed(true)}
          label="Resize sidebar"
          // In the gutter between the column and the pane, not over the column's own rows.
          r={GUTTER_END}
          width="var(--pane-gap)"
        />
      )}
    </YStack>
  )
}
