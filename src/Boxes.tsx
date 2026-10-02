'use client'

// The compute an org is HOLDING: every sandbox lease, what it costs by the
// hour, and the two things you can do to one.
//
// A LEASE IS MONEY RUNNING. It is billed per hour of being held, at the price of
// the envelope it holds — so the rate is on the row rather than in a pricing page
// nobody has open, and the total is stated before anything is taken. A surface
// that hides the meter is how a $0.96 hour becomes a surprise.
//
// RESUMING IS LEASING WITH AN ID. There is no separate verb: `lease({ id })`
// answers the same sandbox if it is still there and a NEW one if the lease
// expired while you were reading, which is the honest answer to resuming
// something that is gone. So the button says Resume and the id it returns is
// what a later call must use.
//
// ENDING IS NOT STOPPING. `stop` interrupts what is running and KEEPS the lease
// — the meter keeps going. `end` releases it, which is what stops the charge.
// Both are drawn, because a runaway command and an unwanted box are different
// problems and one control for both would do the wrong one half the time.

import { useCallback, useEffect, useState } from 'react'
import { say } from './failure'
import { Play, Plus, Square, X } from 'lucide-react'
import type { Sandbox, SandboxClass } from '@hanzo/ai'
import { ChannelHeader } from '@hanzo/ui/agents'
import { Box, Text, XStack, YStack } from '@hanzo/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hanzo/ui'
import { useIam } from '@hanzo/iam/react'
import { hasSession } from './lib/session'
import { useAi } from './lib/ai'

/**
 * The LIST price of an hour of each class, in micro-USD.
 *
 * The platform is the authority — it prices `agents/runtime-hour-<class>` and an
 * operator retunes it there — and the surface cannot read it: the rate rows live
 * behind `GET /v1/commerce/rates/entries`, which is SuperAdmin only and answers
 * 403 to the reader holding this lease. Nothing else in the contract publishes a
 * rate; a sandbox row carries none either.
 *
 * So the table stays — a control that spends money without naming the price is
 * the defect this file exists to avoid — and both places that draw it say LIST,
 * because a number nobody asked the platform for must not read as a live quote.
 * If the two ever disagree, the invoice is right and this is stale.
 */
const HOURLY: Record<SandboxClass, number> = {
  exec: 80_000,
  dev: 80_000,
  desktop: 80_000,
  // Twelve times the memory of the default envelope, and a node packs sixteen
  // of those — so an android lease displaces twelve and is charged for twelve.
  android: 960_000,
}

/** Micro-USD as money. Two places, because that is how an hourly rate reads. */
const usd = (micros: number): string => `$${(micros / 1_000_000).toFixed(2)}`

/** Unix seconds to how long is left, or the fact that it is over. */
const remaining = (expiresAt?: number): string => {
  if (!expiresAt) return ''
  const left = expiresAt - Math.floor(Date.now() / 1000)
  if (left <= 0) return 'expired'
  if (left < 3600) return `${Math.ceil(left / 60)}m left`
  return `${Math.floor(left / 3600)}h ${Math.ceil((left % 3600) / 60)}m left`
}

/**
 * Take a new lease.
 *
 * THE PROJECT IS THE DISK, and that is the whole reason this control asks for
 * one. A volume is named per (org, project) and the name is deterministic, so
 * leasing the same project again finds the SAME disk without a lookup — which is
 * how a conversation continues across a lease that ended. `exec` keeps nothing
 * and takes no project; every other class requires one, so the field appears
 * exactly where it decides something.
 *
 * The rate is stated on the button because taking this lease starts a meter.
 */
function Start({ onDone }: { onDone: () => void }) {
  const { client } = useAi()
  const [klass, setKlass] = useState<SandboxClass>('exec')
  const [project, setProject] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const keeps = klass !== 'exec'

  const take = useCallback(async () => {
    if (!client || busy) return
    if (keeps && !project.trim()) {
      setFailed(`A ${klass} sandbox keeps a disk, so it needs a project to name it.`)
      return
    }
    setBusy(true)
    setFailed(null)
    try {
      await client.sandboxes.lease({
        class: klass,
        ...(keeps ? { project: project.trim() } : {}),
      })
      onDone()
    } catch (e) {
      setFailed((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [client, busy, keeps, klass, project, onDone])

  return (
    <YStack gap="$2" p="$4" borderBottomWidth={1} borderColor="$borderColor">
      <XStack gap="$2" items="center" flexWrap="wrap">
        <Select value={klass} onValueChange={(v) => setKlass(v as SandboxClass)}>
          <SelectTrigger aria-label="Sandbox class" width={200}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(HOURLY) as SandboxClass[]).map((c) => (
              <SelectItem key={c} value={c}>
                {c} — {usd(HOURLY[c])}/hr list
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {keeps ? (
          <XStack
            flex={1}
            minW={160}
            height={34}
            items="center"
            px="$3"
            rounded="$3"
            borderWidth={1}
            borderColor="$borderColor"
          >
            <Text
              render={
                <input
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void take()}
                  placeholder="Project — the disk it keeps"
                />
              }
              flex={1}
              bg="transparent"
              borderWidth={0}
              outlineStyle="none"
              color="inherit"
            />
          </XStack>
        ) : (
          <Text fontSize="$1" color="$soft" flex={1}>
            Keeps nothing — an exec sandbox has no disk.
          </Text>
        )}

        <Box
          render="button"
          onClick={() => void take()}
          px="$3"
          py="$2"
          rounded="$3"
          borderWidth={1}
          borderColor="$borderColor"
          hoverStyle={{ bg: '$hover' }}
        >
          <XStack items="center" gap="$1">
            <Plus size={13} aria-hidden />
            <Text fontSize="$2" color="$ink">
              {busy ? 'Leasing' : 'Lease'}
            </Text>
          </XStack>
        </Box>
      </XStack>

      {failed ? (
        <Text fontSize="$1" color="$soft" numberOfLines={2}>
          {failed}
        </Text>
      ) : null}
    </YStack>
  )
}

function Empty({ children }: { children: string }) {
  return (
    <YStack flex={1} items="center" justify="center" p="$6">
      <Text fontSize="$3" color="$soft" text="center">
        {children}
      </Text>
    </YStack>
  )
}

function Act({
  icon: Icon,
  label,
  onPress,
  busy,
}: {
  icon: typeof Play
  label: string
  onPress: () => void
  busy?: boolean
}) {
  return (
    <Box
      render="button"
      onClick={onPress}
      aria-label={label}
      px="$2"
      py="$1"
      rounded="$2"
      hoverStyle={{ bg: '$hover' }}
    >
      <XStack items="center" gap="$1">
        <Icon size={13} aria-hidden />
        <Text fontSize="$1" color="$soft">
          {busy ? '…' : label}
        </Text>
      </XStack>
    </Box>
  )
}

function Row({
  box,
  onResume,
  onStop,
  onEnd,
  busy,
}: {
  box: Sandbox
  onResume: () => void
  onStop: () => void
  onEnd: () => void
  busy?: string
}) {
  const rate = HOURLY[(box.class ?? 'exec') as SandboxClass] ?? HOURLY.exec
  return (
    <YStack gap="$2" p="$3" borderWidth={1} borderColor="$borderColor" rounded="$3">
      <XStack items="center" gap="$2">
        <Text fontSize="$3" color="$ink" flex={1} numberOfLines={1}>
          {box.class ?? 'exec'}
          {box.project ? ` · ${box.project}` : ''}
        </Text>
        <Text fontSize="$1" color="$soft">
          {usd(rate)}/hr list
        </Text>
      </XStack>

      <XStack gap="$2" items="baseline" flexWrap="wrap">
        {/* The boundary it GOT, which need not be the one asked for — the field
            that matters when the fleet could not honour the request. */}
        <Text fontSize="$1" color="$soft">
          {box.status ?? 'unknown'}
          {box.runtime ? ` · ${box.runtime}` : ''}
        </Text>
        <Text fontSize="$1" color="$soft">
          {remaining(box.expiresAt)}
        </Text>
      </XStack>

      {/* A lease that never came up says why, in the platform's own words. It is
          also billed for nothing, so the row is a report and not a bill. */}
      {box.status === 'error' && box.error ? (
        <Text fontSize="$1" color="$soft" numberOfLines={2}>
          {box.error}
        </Text>
      ) : null}

      <XStack gap="$1">
        <Act icon={Play} label="Resume" onPress={onResume} busy={busy === 'resume'} />
        <Act icon={Square} label="Stop" onPress={onStop} busy={busy === 'stop'} />
        <Act icon={X} label="End" onPress={onEnd} busy={busy === 'end'} />
      </XStack>
    </YStack>
  )
}

export function Boxes() {
  const { client } = useAi()
// SIGNED IN IS THE CREDENTIAL, NOT THE PROFILE. This gated on `user`, which is
// the answer to a userinfo REQUEST — and `IamProvider` swallows that request's
// failure, so a blip or a slow reply left `isAuthenticated` true and `user`
// null, and this pane told somebody holding a perfectly good token to sign in.
// The token is what the API accepts; the profile is decoration on top of it.
  const { isAuthenticated, isLoading } = useIam()
  const [boxes, setBoxes] = useState<Sandbox[] | null>(null)
  const [busy, setBusy] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState<string | null>(null)

  const ready = Boolean(client && isAuthenticated)

  const reload = useCallback(() => {
    if (!ready || !client) return
    client.sandboxes
      .list()
      .then(setBoxes)
      .catch((e: Error) => setFailed(e.message))
  }, [client, ready])

  useEffect(reload, [reload])

  const act = useCallback(
    async (id: string, what: 'resume' | 'stop' | 'end') => {
      if (!client) return
      setBusy((b) => ({ ...b, [id]: what }))
      try {
        if (what === 'resume') await client.sandboxes.lease({ id })
        if (what === 'stop') await client.sandboxes.stop({ id })
        if (what === 'end') await client.sandboxes.end({ id })
        reload()
      } catch (e) {
        setFailed((e as Error).message)
      } finally {
        setBusy((b) => {
          const { [id]: _gone, ...rest } = b
          return rest
        })
      }
    },
    [client, reload],
  )

  const signedIn = isAuthenticated || hasSession()
  if (isLoading) return <Empty>&nbsp;</Empty>
  if (!signedIn) return <Empty>Sign in to see the compute your org is holding.</Empty>
  if (failed) return <Empty>{say(failed, 'this list')}</Empty>
  if (!boxes) return <Empty>Reading your leases.</Empty>

  return (
    <YStack flex={1} minH={0}>
      <ChannelHeader name="Sandboxes">
        <Text fontSize="$2" color="$soft">
          from {usd(HOURLY.exec)}/hr
        </Text>
      </ChannelHeader>

      <Start onDone={reload} />

      {boxes.length === 0 ? (
        <Empty>
          Nothing is running. A sandbox is leased when an agent needs somewhere to
          work, and billed for the hours it is held.
        </Empty>
      ) : (
        <YStack flex={1} minH={0} overflow="scroll" p="$4" gap="$3">
          {boxes.map((box) => (
            <Row
              key={box.id}
              box={box}
              busy={busy[box.id]}
              onResume={() => void act(box.id, 'resume')}
              onStop={() => void act(box.id, 'stop')}
              onEnd={() => void act(box.id, 'end')}
            />
          ))}
        </YStack>
      )}
    </YStack>
  )
}
