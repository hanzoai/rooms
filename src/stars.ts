'use client'

// The rooms this reader has starred.
//
// It lived inside the channel header, so the star it drew was the only thing in
// the app that knew about it: you starred a channel and nothing anywhere changed
// except that one icon. A star is a shortcut or it is decoration, and the
// sidebar is where a shortcut has to appear — so the set moves out here, where
// the header and the sidebar read the same one.
//
// IT LIVES WITH THE READER, in this browser. Starring is a preference, not a
// fact about the org: Team publishes no starred field, and inventing a server
// one would make one person's shortlist everybody's.

import { useCallback, useEffect, useState } from 'react'

/**
 * One store, two shortlists. A room and a project are both things a reader
 * pins, and they are pinned the same way — but they are not the same list, so
 * the kind names the key rather than the two sets sharing one and colliding on
 * an id that happens to match a room's title.
 *
 * `rooms` keeps the key it already had, so nobody's stars move.
 */
const keyOf = (kind: string) => `hanzo.starred-${kind}`

/** How a room is written wherever a person reads it — a sigil and the name.
 *  One formula, because the header and the sidebar star the same room and a
 *  second spelling of its title would star two different things. */
export const titleOf = (name: string, direct?: boolean): string =>
  `${direct ? '@' : '#'} ${name}`

const read = (kind: string): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(keyOf(kind)) || '[]') as string[])
  } catch {
    return new Set()
  }
}

/**
 * The starred rooms, and the toggle that sets them.
 *
 * Read in an effect rather than in the initialiser, because storage is a fact
 * only the browser holds and reading it during the render that hydrates is how
 * the server and the client disagree about a filled star.
 *
 * Every hook instance listens for the change, so starring in the header lights
 * the sidebar in the same tick: two components, one set, no prop threaded
 * between them through the four components that separate them.
 */
export function useStarred(kind = 'rooms'): [Set<string>, (id: string) => void] {
  const [starred, setStarred] = useState<Set<string>>(new Set())

  useEffect(() => {
    setStarred(read(kind))
    const sync = () => setStarred(read(kind))
    window.addEventListener(keyOf(kind), sync)
    // `storage` is the OTHER tab. A reader with the app open twice should not
    // see two different shortlists.
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(keyOf(kind), sync)
      window.removeEventListener('storage', sync)
    }
  }, [kind])

  const toggle = useCallback(
    (id: string) => {
      const next = read(kind)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(keyOf(kind), JSON.stringify([...next]))
      } catch {
        // A browser that refuses storage still gets the star for this session.
      }
      window.dispatchEvent(new Event(keyOf(kind)))
    },
    [kind],
  )

  return [starred, toggle]
}
