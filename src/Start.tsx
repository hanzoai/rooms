'use client'

// Starting a run from here — the composer /dev's empty state promised and did
// not have.
//
// The pane already said "Describe it. Ship it." over "in your terminal, your
// editor, or right here", and `right here` was the one of the three with nothing
// behind it: the idle state drew install cards and no way to send. The comment
// that stood in for it said "there is no create-a-run route to offer: a run
// begins on a machine". THAT IS NO LONGER TRUE — `POST /v1/agents/coding` starts
// one and answers the session to watch it in, which is the row the working view
// already renders.
//
// WHERE IT RUNS IS THE ONE CHOICE, and it is a field rather than a fork:
//
//   no target   the cloud's own sandbox — what a browser gets, because a
//               browser has no machine to offer
//   a target    a machine this org has claimed, routed by id
//
// Nothing here reads the user agent to decide. The web sends no target because
// it HAS none; a surface running on a claimed machine sends that machine's id.
// One endpoint, one field, and the answer comes back rather than being assumed —
// `routed` says whether a machine actually took it, so asking for one and being
// given a sandbox is reported instead of drawn as success.

import { useCallback, useEffect, useState } from 'react'
import { Text, XStack, YStack } from '@hanzo/ui'
import { Composer } from '@hanzo/ui/chat'
import { useOpen } from './open'
import {
  CodingRefusal,
  dispatchable,
  listTargets,
  startCoding,
  type Target,
} from './lib/coding'
import { BAD } from './lib/mix'

/** A field of the start row: 32px, outlined, in the row's own ink. */
const FIELD = {
  height: 32,
  rounded: 8,
  borderWidth: 1,
  borderColor: 'var(--white-10)',
  bg: 'transparent',
  color: 'inherit',
  fontSize: '$2',
} as const

const SOFT = '$soft'

/** The sandbox is a destination like any other, and it is the default one. */
const SANDBOX = ''

export function Start() {
  const { openSession } = useOpen()
  const [prompt, setPrompt] = useState('')
  const [repo, setRepo] = useState('')
  const [where, setWhere] = useState<string>(SANDBOX)
  const [targets, setTargets] = useState<Target[]>([])
  const [busy, setBusy] = useState(false)
  const [tool, setTool] = useState<string>('dev')
  const [err, setErr] = useState<string | null>(null)

  // The machines this org has claimed. An empty list is an ANSWER — every run
  // goes to a sandbox — so it is not an error and draws no warning. Only a
  // refusal is reported, and even then the composer stays usable: a sandbox run
  // needs no target, so being unable to list machines must not stop a send.
  useEffect(() => {
    let live = true
    listTargets()
      .then((t) => live && setTargets(t.filter(dispatchable)))
      .catch(() => {
        /* Listing is an enhancement here; the sandbox needs nothing from it. */
      })
    return () => {
      live = false
    }
  }, [])

  const send = useCallback(async () => {
    const task = prompt.trim()
    if (!task || busy) return
    setBusy(true)
    setErr(null)
    try {
      const run = await startCoding({
        prompt: task,
        repo: repo.trim() || undefined,
        tool: tool || 'dev',
        targetId: where || undefined,
      })
      setPrompt('')
      // The run is ACCEPTED, not finished. Opening its session is what puts the
      // reader where it narrates itself, which is the view this pane replaces.
      openSession(run.sessionId)
    } catch (e) {
      setErr(e instanceof CodingRefusal ? e.message : 'Could not start the run')
    } finally {
      setBusy(false)
    }
  }, [prompt, repo, tool, where, busy, openSession])

  return (
    <YStack width="100%" gap="$2">
      <Composer
        value={prompt}
        onChange={setPrompt}
        onSend={() => void send()}
        busy={busy}
        placeholder="Describe what to build…"
        label="Describe what to build"
      />

      <XStack gap="$2" items="center" flexWrap="wrap">
        <Text
          render={<select value={tool} onChange={(e) => setTool(e.currentTarget.value)} aria-label="Agent Harness" />}
          {...FIELD}
          px={8}
        >
          <option value="dev">Dev</option>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
          <option value="python">Python</option>
        </Text>

        {/* The repo is OPTIONAL and says so by not being required: the server
            takes the org's default when it is empty, and demanding one here
            would put a field in front of a run that does not need it. */}
        <Text
          render={<input value={repo} onChange={(e) => setRepo(e.currentTarget.value)} placeholder="owner/repo (optional)" aria-label="Repository" />}
          {...FIELD}
          flex={1}
          minW={160}
          px={10}
          outlineStyle="none"
        />

        {/* WHERE. Rendered only when there is a choice to make: with no claimed
            machine online there is exactly one destination, and a select with
            one option is a control that cannot be used. */}
        {targets.length > 0 ? (
          <Text
            render={<select value={where} onChange={(e) => setWhere(e.currentTarget.value)} aria-label="Where to run" />}
            {...FIELD}
            px={8}
          >
            <option value={SANDBOX}>Sandbox</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label || t.host || t.id}
                {t.capacity ? ` — ${t.capacity}` : ''}
              </option>
            ))}
          </Text>
        ) : null}
      </XStack>

      {err ? (
        <Text role="alert" fontSize="$2" color={BAD}>
          {err}
        </Text>
      ) : (
        <Text fontSize="$2" color={SOFT}>
          {targets.length > 0 && where !== SANDBOX
            ? 'Runs on your machine.'
            : 'Runs in an isolated sandbox with Free AI / Enso.'}
        </Text>
      )}
    </YStack>
  )
}
