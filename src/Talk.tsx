'use client'

// A room, read and answered.
//
// The org's rooms live on /home: the rail lists them, this pane reads one, and
// the composer answers in it. It draws the same three parts every other room on
// this site draws — the header, the transcript, the one composer — from the
// same components, so a room is not a second design.
//
// WHO SAID IT is the roster's answer (`roster.ts`). A message carries the
// account that wrote it, and the name and face beside each row are looked up
// there, once, for people and agents alike; an account the roster lacks is
// printed as the id it is. The transcript is polled by `rooms.ts`, so an answer
// — a teammate's or an agent's — lands without a reload.
//
// WHAT YOU SAY IS DRAWN AT ONCE, in the quiet ink and without a stamp, and it
// stays only if the platform keeps it: the accepted row replaces it, a refusal
// drops it and hands the words back to the field. Nothing the platform did not
// accept is on screen for longer than one round trip.

import { useRef, useState } from 'react'
import { ChannelHeader } from '@hanzo/ui/agents'
import { Composer } from '@hanzo/ui/chat'
import { Box, Text, XStack, YStack } from '@hanzo/ui'
import { Users } from 'lucide-react'
import { useIam } from '@hanzo/iam/react'
import { Face } from './cast'
import { SpeakButton } from './speech'
import { say } from './failure'
import { useOpen } from './open'
import { Beside } from './Shell'
import { memberOf, useMe, useRoster, type Member } from './roster'
import { useRoomMessages, type TeamRoom } from './rooms'
import { BAD } from './lib/mix'

/** The clock a transcript reads by: the time for today, the date before that. */
function when(ms: number): string {
  const then = new Date(ms)
  const sameDay = new Date().toDateString() === then.toDateString()
  return then.toLocaleString(
    undefined,
    sameDay ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' },
  )
}

/**
 * WHAT A ROOM IS CALLED. A channel carries a name; a direct message does not —
 * its members are its name — so one falls back to the other rather than drawing
 * an empty header. The sigil is how a client DRAWS a room and is not stored, so
 * it is added here and only where there is a name to put it on.
 */
const titleOf = (room: TeamRoom): string =>
  room.name ? `#${room.name}` : room.direct ? 'Direct message' : 'Room'

/** Adds `@name ` to a draft, after a space where the draft needs one. */
const mention = (draft: string, name: string): string =>
  `${draft && !/\s$/.test(draft) ? `${draft} ` : draft}@${name} `

export function Talk({ room }: { room: TeamRoom }) {
  const { messages, failed, send } = useRoomMessages(room.id, room.space)
  const { members, wrong } = useRoster()
  const me = useMe()
  const { aside, showAside } = useOpen()
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<{ key: number; text: string }[]>([])
  const [refused, setRefused] = useState<string | null>(null)
  const minted = useRef(0)

  const agents = (members ?? []).filter((one) => one.agent)
  const mine = me ? memberOf(members, me) : undefined

  const speak = async () => {
    const text = draft.trim()
    if (!text) return
    const key = ++minted.current
    setDraft('')
    setRefused(null)
    setPending((held) => [...held, { key, text }])
    try {
      await send(text)
    } catch (e) {
      setDraft(text)
      setRefused(say(e, 'this room', 'save'))
    } finally {
      setPending((held) => held.filter((one) => one.key !== key))
    }
  }

  const name = (of: string) => setDraft((held) => mention(held, of))

  return (
    <YStack flex={1} minH={0}>
      <ChannelHeader name={titleOf(room)}>
        {room.topic ? (
          <Text fontSize="$2" color="$soft" numberOfLines={1}>
            {room.topic}
          </Text>
        ) : null}
        <Box
          render="button"
          aria-label={aside === 'roster' ? 'Hide directory & roster' : 'Show directory & roster'}
          aria-pressed={aside === 'roster'}
          onClick={() => showAside(aside === 'roster' ? null : 'roster')}
          ml="auto"
          p="$2"
          rounded="$3"
          hoverStyle={{ bg: '$hover' }}
        >
          <Users size={16} aria-hidden />
        </Box>
      </ChannelHeader>

      <YStack flex={1} minH={0} overflow="scroll" p="$4" gap="$3">
        {/* THREE STATES, AND SILENCE IS NOT ONE. A room that has not answered,
            a room that answered with nothing, and a room that refused all read
            differently — a pane that drew an empty list for all three would
            report an outage as an empty conversation. */}
        {failed ? (
          <Text fontSize="$3" color="$soft">
            {say(failed, 'this room')}
          </Text>
        ) : messages === null ? (
          <Text fontSize="$3" color="$soft">
            Reading the room.
          </Text>
        ) : messages.length === 0 && pending.length === 0 ? (
          <Text fontSize="$3" color="$soft">
            Nothing has been said here yet.
          </Text>
        ) : (
          messages.map((one) => (
            <Line
              key={one.id}
              member={memberOf(members, one.author)}
              fallback={one.author}
              stamp={when(one.createdOn)}
              text={one.text}
            />
          ))
        )}
        {/* A line the platform has since stored is drawn once, as stored. */}
        {pending
          .filter((one) => !messages?.some((said) => said.author === me && said.text === one.text))
          .map((one) => (
            <Line key={`pending-${one.key}`} member={mine} fallback="You" text={one.text} soft />
          ))}
      </YStack>

      <YStack p="$3" gap="$2" borderTopWidth={1} borderColor="$borderColor">
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => void speak()}
          placeholder={`Message ${titleOf(room)}`}
          label={`Message ${titleOf(room)}`}
          hint={agents.length ? 'Mention an agent with @name and it answers.' : undefined}
        >
          {agents.length ? (
            <XStack gap="$1" flexWrap="wrap" shrink={1} minW={0}>
              {agents.map((one) => (
                <Box
                  key={one.id}
                  render="button"
                  aria-label={`Mention ${one.name}`}
                  onClick={() => name(one.name)}
                  px="$2"
                  py="$1"
                  rounded="$10"
                  hoverStyle={{ bg: '$hover' }}
                >
                  <Text fontSize="$2" color="$soft">
                    @{one.name}
                  </Text>
                </Box>
              ))}
            </XStack>
          ) : null}
        </Composer>
        {refused ? (
          <Text fontSize="$2" color={BAD}>
            {refused}
          </Text>
        ) : null}
      </YStack>

      {/* The frame owns the column; this is what a room puts in it when the
          header's Users control asks for the roster. */}
      <Beside>
        {aside === 'roster' ? <Roster members={members} wrong={wrong} onMention={name} /> : null}
      </Beside>
    </YStack>
  )
}

/** One thing said: a face, a name, the stamp where the platform gave one. */
function Line({
  member,
  fallback,
  stamp,
  text,
  soft,
}: {
  member?: Member
  /** What to print when the roster has no member for the author. */
  fallback: string
  stamp?: string
  text: string
  soft?: boolean
}) {
  const ink = soft ? '$soft' : '$ink'
  return (
    <XStack gap="$3" items="flex-start">
      <Face src={member?.avatar} name={member?.name ?? fallback} size={32} person />
      <YStack flex={1} minW={0} gap="$1">
        <XStack gap="$2" items="baseline">
          <Text fontSize="$3" fontWeight="500" color={ink} numberOfLines={1}>
            {member?.name ?? fallback}
          </Text>
          {member?.agent ? (
            <Box px="$1.5" py="$0.5" rounded="$2" bg="$hover">
              <Text fontSize="$1" color="$soft" fontWeight="600">
                Agent
              </Text>
            </Box>
          ) : null}
          {stamp ? (
            <Text fontSize="$1" color="$soft">
              {stamp}
            </Text>
          ) : null}
        </XStack>
        <Text fontSize="$3" color={ink}>
          {text}
        </Text>
        <XStack mt="$1">
          <SpeakButton text={text} agentName={member?.name ?? fallback} compact />
        </XStack>
      </YStack>
    </XStack>
  )
}

/**
 * Who is here, beside the room. An agent is pressable — pressing it names it in
 * the draft, which is how it is asked something — and a person is a person:
 * IAM publishes no route that messages one, so the row identifies rather than
 * opens.
 */
function Roster({
  members,
  wrong,
  onMention,
}: {
  members: Member[] | null
  wrong: unknown
  onMention: (name: string) => void
}) {
  const { isAuthenticated } = useIam()
  const line = !isAuthenticated
    ? 'Sign in to see who is here.'
    : wrong
      ? say(wrong, "this org's roster")
      : members === null
        ? 'Reading the roster.'
        : members.length < 2
          ? 'Just you.'
          : null
  return (
    <YStack>
      <XStack
        height={48}
        shrink={0}
        items="center"
        px="$3"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        <Text fontSize="$3" fontWeight="600" color="$ink">
          Roster
        </Text>
      </XStack>
      {line ? (
        <Text p="$3" fontSize="$2" color="$soft">
          {line}
        </Text>
      ) : (
        <YStack p="$2" gap="$0.5">
          {(members ?? []).map((one) => (
            <Box
              key={one.id}
              render={one.agent ? 'button' : 'div'}
              onClick={one.agent ? () => onMention(one.name) : undefined}
              aria-label={one.agent ? `Mention ${one.name}` : undefined}
              width="100%"
              minW={0}
              items="flex-start"
              px="$2"
              py="$1.5"
              rounded="$3"
              hoverStyle={one.agent ? { bg: '$hover' } : undefined}
            >
              <XStack items="center" gap="$2" width="100%">
                <Face src={one.avatar} name={one.name} size={24} person />
                {/* A `<button>` centres its text; the name reads left like its neighbours. */}
                <Text fontSize="$2" color="$ink" numberOfLines={1} flex={1} minW={0} text="left">
                  {one.name}
                </Text>
                {one.agent ? (
                  <Text fontSize="$1" color="$soft">
                    agent
                  </Text>
                ) : null}
              </XStack>
            </Box>
          ))}
        </YStack>
      )}
    </YStack>
  )
}
