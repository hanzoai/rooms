'use client'

// What the rail and the pane both need to know: which conversation is open, and
// which run.
//
// THIS LIVES OUTSIDE REACT, and that is the whole point. The selection used to
// be `useState` inside `Workspace`, which the router MOUNTS — so `router.push`
// between two rooms unmounted the component holding the selection and the
// reader arrived in an empty room. "One level up, where both can reach it" was
// right about the rail and the pane and one level too low for the router: a
// value that must outlive a route change cannot be stored inside a component
// the route change destroys.
//
// A module is above every component, so the router cannot reach it. It resets
// on a real page load, which is correct — a fresh document is a fresh room.

import { useSyncExternalStore } from 'react'

export interface Open {
  /** The open thread's id, or null for a new one. */
  thread: string | null
  open: (id: string | null) => void
  /**
   * The open run's id, or null for none.
   *
   * A second field and not a reused one: a thread is not a session, and one
   * `selected` holding either would be a string whose meaning depends on which
   * route is mounted — the kind of value that reads fine and resolves wrong.
   */
  session: string | null
  openSession: (id: string | null) => void
  /**
   * The open inbox room's key ("<channel> <roomId>"), or null for none.
   *
   * A third field for the same reason there is a second: a room arrives over
   * Slack or iMessage and is keyed by its transport, so it is not a thread id
   * and cannot share the field with one. `useInbox` derives rooms from the page
   * it holds, so this key is only meaningful against that page.
   */
  room: string | null
  openRoom: (key: string | null) => void
  /** The open drive bucket, or null for the list of them. */
  bucket: string | null
  openBucket: (name: string | null) => void
  /** The Settings pane a surface has asked for, or null. */
  settings: string | null
  showSettings: (pane: string | null) => void
  /** What is open beside the room, by name, or null for nothing. */
  aside: string | null
  showAside: (pane: string | null) => void
  /** Who the chat is with, in the order they were pressed; empty for the plain model. */
  agents: string[]
  /** The first of them, for a surface that addresses one. */
  agent: string | null
  /** Adds a character to the open conversation, or lets one out who is already in it; null empties it. */
  openAgent: (name: string | null) => void
  /** The room a stored conversation names, set as it is read back; the conversation stays open. */
  seat: (names: string[]) => void
  /** The room outright: a roster row opens a chat with that one character. */
  withAgents: (names: string[]) => void
  /**
   * How many times the room has been emptied.
   *
   * A COUNTER AND NOT A FLAG, because the fact is an EVENT and the state it
   * asks for is one the room may already be in. "New chat" nulls the thread,
   * and on a room whose thread is already null that is not a change — so the
   * pane's effect never re-ran and the button did nothing at all. A number that
   * only ever goes up is the smallest thing two components can agree happened.
   */
  emptied: number
  empty: () => void
}

interface Selection {
  thread: string | null
  session: string | null
  room: string | null
  bucket: string | null
  emptied: number
  /**
   * The Settings pane a surface has asked for, or null.
   *
   * A pane deep in the tree cannot reach the shell's own state, and the thing
   * it wants is not a route — Settings opens OVER the room rather than instead
   * of it. So the request lands here, where both can see it, for the same
   * reason the open thread does.
   */
  settings: string | null
  /**
   * Who the chat is WITH, by name, in the order they were pressed; empty for
   * the plain model.
   *
   * A separate field from `session` for the reason `session` is separate from
   * `thread`: a run is something an agent is DOING and this is who you are
   * talking to. One value holding either would be a string whose meaning
   * depends on which room is mounted.
   *
   * A LIST AND NOT A NAME, because a room holds more than one: pressing a
   * second face adds them beside the first rather than replacing them, and
   * the thread's system turn says who is in the room and how each speaks.
   */
  agents: string[]
  /**
   * What is open BESIDE the room, by name, or null for nothing.
   *
   * A NAME AND NOT A FLAG, because the column holds a different thing depending
   * on what was asked for — the work behind an answer, a preview of what a run
   * built — and a boolean leaves the room to guess which of those it is drawing.
   * Null is shut.
   *
   * It lives here rather than in the frame for the reason `settings` does: the
   * control that opens it and the surface that fills it are on opposite sides of
   * the router, and this is where two such components can agree.
   */
  aside: string | null
}

/** The prerender's selection, and the initial one. A stable reference: React
 *  compares snapshots by identity, so returning a fresh object every read is an
 *  infinite render rather than an empty room. */
const EMPTY: Selection = {
  thread: null,
  session: null,
  room: null,
  bucket: null,
  emptied: 0,
  settings: null,
  agents: [],
  aside: null,
}

let selection: Selection = EMPTY

if (typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('thread')
    const s = params.get('session')
    const a = params.get('agent')
    const asideParam = params.get('aside')
    if (t || s || a || asideParam) {
      selection = {
        ...EMPTY,
        thread: t ?? EMPTY.thread,
        session: s ?? EMPTY.session,
        agents: a ? a.split(',').map((one) => one.trim()).filter(Boolean) : EMPTY.agents,
        aside: asideParam ?? EMPTY.aside,
      }
    }
  } catch {}
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const read = (): Selection => selection
const readOnServer = (): Selection => EMPTY

function set(next: Selection): void {
  if (
    next.thread === selection.thread &&
    next.session === selection.session &&
    next.room === selection.room &&
    next.bucket === selection.bucket &&
    next.emptied === selection.emptied &&
    next.settings === selection.settings &&
    next.agents.join('\n') === selection.agents.join('\n') &&
    next.aside === selection.aside
  ) {
    return
  }
  selection = next
  for (const listener of listeners) listener()
}

/** Opens a thread, or empties the room with null. */
export function openThread(id: string | null): void {
  set({ ...selection, thread: id })
}

/** Opens a run, or empties the pane with null. */
export function openSession(id: string | null): void {
  set({ ...selection, session: id })
}

/** Opens an inbox room, or empties the pane with null. */
export function openRoom(key: string | null): void {
  set({ ...selection, room: key })
}

/** Opens a bucket, or returns to the list of them with null. */
export function openBucket(name: string | null): void {
  set({ ...selection, bucket: name })
}

/**
 * Adds a character to the open conversation, or lets one out who is already in
 * it; null empties the room. The conversation stays open: the room's system
 * turn changes for the turns that follow, and Chat records the new room with
 * the thread (`roster` in cast.tsx).
 */
export function openAgent(name: string | null): void {
  const agents =
    name === null
      ? []
      : selection.agents.some((one) => same(one, name))
        ? selection.agents.filter((one) => !same(one, name))
        : [...selection.agents, name]
  set({ ...selection, agents })
}

/** The room a stored conversation names, as it is read back. The thread stays open. */
export function seat(names: string[]): void {
  set({ ...selection, agents: names.filter((one, i) => names.findIndex((other) => same(other, one)) === i) })
}

/** Two handles name one character when they differ only in case ("Des" and "des"). */
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** The room outright — a roster row opens a chat with that one character. */
export function withAgents(names: string[]): void {
  set({ ...selection, agents: [...new Set(names)], thread: null, emptied: selection.emptied + 1 })
}

/** Opens one pane beside the room, or shuts the column with null. */
export function showAside(pane: string | null): void {
  set({ ...selection, aside: pane })
}

/** Asks the shell to open Settings on one pane, or closes it with null. */
export function showSettings(pane: string | null): void {
  set({ ...selection, settings: pane })
}

/** Empties the room: no thread, and a fresh count so the pane hears it even
 *  when there was no thread to leave. */
export function empty(): void {
  set({ ...selection, thread: null, emptied: selection.emptied + 1 })
}

export function useOpen(): Open {
  const current = useSyncExternalStore(subscribe, read, readOnServer)
  return {
    thread: current.thread,
    open: openThread,
    session: current.session,
    openSession,
    room: current.room,
    openRoom,
    bucket: current.bucket,
    openBucket,
    settings: current.settings,
    showSettings,
    aside: current.aside,
    showAside,
    agents: current.agents,
    agent: current.agents[0] ?? null,
    openAgent,
    seat,
    withAgents,
    emptied: current.emptied,
    empty,
  }
}
