'use client'

// The inbox: what arrived, on whichever network carried it.
//
// IT READS LIKE MAIL, because that is what it is. The list stands beside what is
// open rather than being replaced by it: picking a message used to swap the
// whole pane, so choosing the next one meant going back first, and the list —
// the thing that tells you which to read — was never on screen while you read.
// Two columns is how every mail client has answered this, and the reason is the
// same here.
//
// ONE READING, MANY TRANSPORTS. `channel` is measured by the server, so the
// mark beside each face is a fact about the message. Nothing here enumerates
// the networks; `network.tsx` names the ones it can draw and falls back for the
// rest, so a fifth transport appears the day the platform reports one.
//
// IT HOLDS WHAT OTHER NETWORKS CARRY IN, and only that. The rooms this org
// talks in are places on this platform, read and answered on /home
// (`rooms.ts`); an arrival is a thread you REPLY to on the transport it came
// in on, and `conversations.ts` keys the two apart so one selection slot never
// holds two id spaces.
//
// IT IS TWO-WAY NOW, and the note that said otherwise had outlived the route it
// described. `@hanzo/ai`'s channels client still opens "INBOUND ONLY … a client
// that offered send() would be inventing a route", and the platform publishes
// `POST /v1/channels/{channel}/send` — measured on api.hanzo.ai, with the
// envelope's outbound projection spelled in its own description. So the reply
// goes through `client.http` here rather than through a client method that does
// not exist yet; when the SDK gains one, this call site is the only thing that
// moves.
//
// A reply box that cannot reply is still worse than none, which is why this one
// is drawn only where there is a room id to address.

import { useCallback, useMemo, useRef, useState } from 'react'
import { useInbox } from '@hanzo/ai/react'
import { ChannelHeader } from '@hanzo/ui/agents'
import { Composer } from '@hanzo/ui/chat'
import { Box, Text, XStack, YStack } from '@hanzo/ui'
import { useIam } from '@hanzo/iam/react'
import { Plus } from 'lucide-react'
import { useAi } from './lib/ai'
import { useOpen } from './open'
import { Face } from './cast'
import { plainly } from './failure'
import { Network, of, roomName, speaker } from './network'
import {
  conversationOf,
  useConversations,
  type Conversation,
} from './conversations'
import { Directory } from './Directory'
import { BAD } from './lib/mix'

/** Unix SECONDS, which is what the platform sends. Milliseconds here read as 1970. */
const when = (seconds: number): string =>
  new Date(seconds * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

/** Today says the time; anything older says the day. A list scans on the part
 *  that differs, and for mail from this morning that is the clock. */
function stamp(seconds: number): string {
  const then = new Date(seconds * 1000)
  const now = new Date()
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  return then.toLocaleString(
    undefined,
    sameDay ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' },
  )
}

/**
 * WHO WROTE, AND FROM WHERE — one mark.
 *
 * The face is a disc and the network is a square tucked into its corner,
 * because they answer two different questions and a reader should not have to
 * tell two circles apart. The disc draws neither picture nor initials: the
 * platform sends no likeness, and there is no name to reduce to letters — it
 * drew the head of the platform's id, which on Slack is the same letter for
 * everybody, so it told nobody apart while looking like somebody's initials.
 * A disc with nothing to say says '?', which is what it means.
 */
function Sender({ channel, size = 36 }: { channel: string; size?: number }) {
  return (
    <YStack width={size} height={size} shrink={0} position="relative">
      <Face size={size} />
      <YStack position="absolute" b={-2} r={-2}>
        <Network channel={channel} size={Math.round(size * 0.46)} />
      </YStack>
    </YStack>
  )
}

/** Where a network is connected. Opens My Channels modal. */
function Connect() {
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <>
      <Box
        render="button"
        onClick={() => setModalOpen(true)}
        px="$3"
        py="$2"
        rounded="$3"
        borderWidth={1}
        borderColor="$borderColor"
        hoverStyle={{ bg: '$hover' }}
        cursor="pointer"
      >
        <XStack items="center" gap="$1.5">
          <Plus size={13} aria-hidden />
          <Text fontSize="$2" color="$ink">
            Connect an app
          </Text>
        </XStack>
      </Box>
      {/* THE ONE DIRECTORY, opened on its Channels tab: the same grid the rail's
          door reaches, reading the same registry. This used to open a modal of
          its own that marked a provider connected the moment it was pressed. */}
      <Directory open={modalOpen} onClose={() => setModalOpen(false)} tab="channels" />
    </>
  )
}

function Empty({ children, offer }: { children: string; offer?: boolean }) {
  return (
    <YStack flex={1} items="center" justify="center" p="$6" gap="$3">
      {/* THE ROOM'S ONE HEADING. Every state of a room owes a reader exactly one
          h1, and the empty states are the ones that shipped none — a crawler and
          a screen reader both land here first. It names the room, not the state. */}
      <Text render="h1" fontSize="$4" fontWeight="600" color="$ink">
        Inbox
      </Text>
      <Text fontSize="$3" color="$soft" text="center" maxW={420}>
        {children}
      </Text>
      {offer ? <Connect /> : null}
    </YStack>
  )
}

/** The list, which stays on screen while you read down it. */
function Arrivals({
  rooms,
  open,
  onPick,
}: {
  rooms: Conversation[]
  open: string | null
  onPick: (key: string) => void
}) {
  return (
    <YStack flex={1} minH={0}>
      <XStack
        height={48}
        shrink={0}
        items="center"
        px="$3"
        gap="$2"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        <Text flex={1} fontSize="$3" fontWeight="600" color="$ink">
          Inbox
        </Text>
        <Connect />
      </XStack>

      <YStack flex={1} minH={0} overflow="scroll">
        {/* ALREADY SORTED, by the one function that holds both sources — a
            second sort here would be a second answer to "which is newest", and
            the two would disagree the moment one of them learned about a unit. */}
        {rooms.map((one) => (
          <Box
            key={one.key}
            render="button"
            onClick={() => onPick(one.key)}
            aria-current={one.key === open}
            display="block"
            width="100%"
            cursor="pointer"
            borderBottomWidth={1}
            borderColor="var(--borderColor, var(--white-08))"
            bg={one.key === open ? 'var(--raised, var(--white-06))' : 'transparent'}
            hoverStyle={{ bg: '$hover' }}
          >
            <XStack gap="$3" items="center" p="$3">
              <Sender channel={one.channel} />
              {/* A gui Stack has no textAlign, and a `<button>` centres its text:
                  `alignItems` sets the lines at the left, and the title, which is
                  as wide as the row, says `left` itself. */}
              <YStack flex={1} minW={0} gap="$1" items="flex-start">
                <XStack width="100%" items="baseline" gap="$2">
                  <Text fontSize="$3" fontWeight="600" color="$ink" numberOfLines={1} flex={1} text="left">
                    {one.title}
                  </Text>
                  {/* A room nobody has spoken in has no time to show, and 1970
                      is not a time. Silence is the honest answer. */}
                  {one.lastAt ? (
                    <Text fontSize="$1" color="$soft">
                      {stamp(one.lastAt / 1000)}
                    </Text>
                  ) : null}
                </XStack>
                {/* The last thing said, on one line. A preview that wraps is a
                    transcript, and the list stops being scannable. */}
                {one.preview ? (
                  <Text fontSize="$2" color="$soft" numberOfLines={1}>
                    {one.preview}
                  </Text>
                ) : null}
              </YStack>
            </XStack>
          </Box>
        ))}
      </YStack>
    </YStack>
  )
}

/** What is open, beside the list rather than instead of it. */
function Reading({
  room,
  reload,
}: {
  room: ReturnType<typeof useInbox>['rooms'][number]
  reload: () => void
}) {
  const { client } = useAi()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  /**
   * Say it back, on the transport it arrived on.
   *
   * IDENTITY IS NOT A FIELD: the channel is the path segment and the sender is
   * the caller's validated org, and the route refuses a body carrying `sender`,
   * `account` or `channel` with a 400 rather than dropping it quietly. So the
   * body is the room and the words, and nothing else.
   *
   * The room's own refusals are the reader's situation and are shown as the
   * platform words them — a room this org has not bound is 403, and one whose
   * route the bot has never learned is 409, which means somebody has to message
   * it there first. `plainly` keeps those and answers for the estate's own.
   *
   * The list is re-read rather than appended to: what the transport accepted is
   * what it assigned an id and a landing second to, and inventing a local row
   * would put a message on screen that may not have gone.
   */
  const send = useCallback(async () => {
    const text = draft.trim()
    if (!client || !text || sending || !room.roomId) return
    setSending(true)
    setFailed(null)
    try {
      await client.http.json({
        method: 'POST',
        path: `/v1/channels/${encodeURIComponent(room.channel)}/send`,
        body: { room: { id: room.roomId }, text },
      })
      setDraft('')
      reload()
    } catch (e) {
      setFailed(plainly(e, 'this room'))
    } finally {
      setSending(false)
    }
  }, [client, draft, sending, room.channel, room.roomId, reload])

  return (
    <YStack flex={1} minH={0}>
      {/* A room is named by its own address, not by whoever spoke in it last.
          One person is the handle we hold for them; several is the network's
          id for the room, which useInbox already groups on and which is the
          only thing that tells two rooms on one network apart. */}
      <ChannelHeader
        name={roomName(room)}
      >
        <XStack items="center" gap="$1.5">
          <Network channel={room.channel} size={14} />
          <Text fontSize="$2" color="$soft">
            {of(room.channel).name}
          </Text>
        </XStack>
      </ChannelHeader>

      <YStack flex={1} minH={0} overflow="scroll" p="$4" gap="$3">
        {/* Oldest first, so a conversation reads down the way it happened. The
            page arrives newest-first because that is how a cursor pages. */}
        {[...room.messages]
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((message) => (
            <XStack key={message.id} gap="$3" items="flex-start">
              <Sender channel={room.channel} size={32} />
              <YStack flex={1} minW={0} gap="$1">
                <XStack gap="$2" items="baseline">
                  <Text fontSize="$3" fontWeight="500" color="$ink">
                    {speaker(room.channel, message.sender)}
                  </Text>
                  <Text fontSize="$1" color="$soft">
                    {when(message.createdAt)}
                  </Text>
                </XStack>
                <Text fontSize="$3" color="$ink">
                  {message.text}
                </Text>
              </YStack>
            </XStack>
          ))}
      </YStack>

      <YStack p="$3" gap="$2" borderTopWidth={1} borderColor="$borderColor">
        {/* NO ROOM ID, NO REPLY. The send route addresses a room and refuses a
            body without one, so a composer here would take what somebody typed
            and drop it — which is the thing this pane refused to do while there
            was no route at all. */}
        {room.roomId ? (
          <>
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={() => void send()}
              busy={sending}
              placeholder={`Reply on ${of(room.channel).name}`}
              label={`Reply on ${of(room.channel).name}`}
            />
            {failed ? (
              <Text fontSize="$2" color={BAD}>
                {failed}
              </Text>
            ) : null}
          </>
        ) : (
          <Text fontSize="$2" color="$soft">
            This message names no room to answer in.
          </Text>
        )}
      </YStack>
    </YStack>
  )
}

function InboxGrip({
  span,
  onSpan,
}: {
  span: number
  onSpan: (n: number) => void
}) {
  const held = useRef(0)
  return (
    <Box
      render="div"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inbox channel list"
      aria-valuenow={span}
      tabIndex={0}
      position="absolute"
      t={0}
      b={0}
      r={-3}
      width={6}
      z={10}
      cursor="col-resize"
      hoverStyle={{ bg: '$borderColor' }}
      onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        held.current = e.clientX - span
      }}
      onPointerMove={(e: React.PointerEvent<HTMLDivElement>) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        const want = e.clientX - held.current
        const clamped = Math.min(540, Math.max(220, want))
        onSpan(clamped)
      }}
      onPointerUp={() => {
        try {
          localStorage.setItem('hanzo.inbox.span', String(span))
        } catch {}
      }}
    />
  )
}

function ReadingInbox() {
  const { room, openRoom } = useOpen()
  const { conversations, loading, reload } = useConversations()
  const [listSpan, setListSpan] = useState<number>(() => {
    if (typeof window === 'undefined') return 320
    try {
      const stored = localStorage.getItem('hanzo.inbox.span')
      return stored ? Math.max(220, Math.min(540, parseInt(stored, 10))) : 320
    } catch {
      return 320
    }
  })

  const open = useMemo(() => conversationOf(conversations, room), [conversations, room])

  if (loading && conversations.length === 0) return <Empty>Reading your messages.</Empty>

  if (conversations.length === 0) {
    return (
      <Empty offer>
        Nothing has arrived yet. Connect an app and the messages it carries land
        here — mail, chat, and the networks your work already happens on.
      </Empty>
    )
  }

  return (
    <XStack flex={1} minH={0} position="relative">
      {/* THE LIST IS A COLUMN, not the whole pane. On a phone there is room for
          one of the two, so what is open takes it and the list is a step back;
          from a tablet up they stand side by side, which is the shape the
          reading is actually done in. */}
      <YStack
        display={open ? 'none' : 'flex'}
        $md={{ display: 'flex', width: listSpan, shrink: 0, borderRightWidth: 1 }}
        flex={1}
        minH={0}
        borderColor="$borderColor"
        position="relative"
      >
        <Arrivals rooms={conversations} open={room} onPick={openRoom} />
        <InboxGrip span={listSpan} onSpan={setListSpan} />
      </YStack>

      {/* An arrival is replied to on the transport it came in on. */}
      {open ? (
        <YStack flex={1} minW={0} minH={0}>
          <Reading room={open.arrival} reload={reload} />
        </YStack>
      ) : (
        <YStack display="none" $md={{ display: 'flex' }} flex={1} minW={0}>
          <Empty>Pick a conversation to read it.</Empty>
        </YStack>
      )}
    </XStack>
  )
}

/**
 * The pane, and the session its reads need.
 *
 * SPLIT so the hooks below never run for a reader with none: every route this
 * pane reads is org-scoped and answers 403 without one, and a hook cannot be
 * called conditionally — so the condition is a component boundary rather than
 * an `if` the rules forbid.
 */
export function Inbox() {
  const { isLoading } = useIam()
  if (isLoading) return <Empty>&nbsp;</Empty>
  return <ReadingInbox />
}
