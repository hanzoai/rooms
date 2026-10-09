import { describe, expect, test } from 'vitest'
import type { Thread } from '@hanzo/ai'
import { attempt, bind, enlist, snapshot, sweep, tick, view, type Reader } from './pending'

// Each test names its own conversations, so the changes one leaves settled
// cannot reach another's lists.
let n = 0
const ids = () => {
  n++
  return { a: `${n}-a`, b: `${n}-b`, c: `${n}-c` }
}

const thread = (id: string, at: string, extra: Partial<Thread> = {}): Thread => ({ id, title: id, updatedAt: at, ...extra })

/** A store answer the test settles by hand, and whether it was asked for yet. */
function answer<T>() {
  let ok!: (v: T) => void
  let no!: (e: Error) => void
  const promise = new Promise<T>((resolve, reject) => {
    ok = resolve
    no = reject
  })
  const call = { asked: false, promise, ok, no, send: () => ((call.asked = true), promise) }
  return call
}

/** Lets every answer already given be heard. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A list on the page, read now. */
function reader(): Reader & { asked: number } {
  const r = { at: tick(), asked: 0, reload: () => r.asked++ }
  return r
}

describe('a change shows at once', () => {
  test('a pin and a rename show in place, before the store answers', async () => {
    const { a, b } = ids()
    const list = [thread(a, '2026-10-08T10:00:00Z'), thread(b, '2026-10-08T09:00:00Z')]
    const r = reader()
    const leave = enlist(r)
    const store = answer<Thread>()
    const done = attempt(list[1], { pinned: true, title: 'Borealis' }, store.send)
    expect(view(list, r.at, false).map((t) => [t.id, t.pinned ?? false, t.title])).toEqual([
      [a, false, a],
      [b, true, 'Borealis'],
    ])
    store.ok({ ...list[1], pinned: true, title: 'Borealis' })
    await done
    leave()
  })

  test('a delete takes the row out; archiving moves it from the active list to the archived one', async () => {
    const { a, b, c } = ids()
    const active = [thread(a, '2026-10-08T10:00:00Z'), thread(b, '2026-10-08T09:00:00Z')]
    const shelf = [thread(c, '2026-10-01T09:00:00Z', { archived: true })]
    const gone = answer<void>()
    const away = answer<Thread>()
    const deleting = attempt(active[0], null, gone.send)
    const archiving = attempt(active[1], { archived: true }, away.send)
    expect(view(active, 0, false)).toEqual([])
    // Joins the shelf in the store's order: the most recently spoken in first.
    expect(view(shelf, 0, true).map((t) => t.id)).toEqual([b, c])
    gone.ok()
    away.ok({ ...active[1], archived: true })
    await Promise.all([deleting, archiving])
  })

  test('a refusal takes the change back and is thrown to the caller', async () => {
    const { a } = ids()
    const list = [thread(a, '2026-10-08T10:00:00Z', { pinned: false })]
    const store = answer<Thread>()
    const done = attempt(list[0], { pinned: true }, store.send)
    const shown = snapshot()
    expect(view(list, 0, false)[0].pinned).toBe(true)
    store.no(new Error('That conversation is not yours.'))
    await expect(done).rejects.toThrow('That conversation is not yours.')
    expect(snapshot()).toBeGreaterThan(shown)
    expect(view(list, 0, false)).toEqual(list)
  })

  test('a refused delete brings the row back', async () => {
    const { a, b } = ids()
    const list = [thread(a, '2026-10-08T10:00:00Z'), thread(b, '2026-10-08T09:00:00Z')]
    const store = answer<void>()
    const done = attempt(list[0], null, store.send)
    expect(view(list, 0, false).map((t) => t.id)).toEqual([b])
    store.no(new Error('offline'))
    await expect(done).rejects.toThrow('offline')
    expect(view(list, 0, false).map((t) => t.id)).toEqual([a, b])
  })
})

describe("one conversation's changes go to the store in order", () => {
  test('a refused rename leaves a pin still in flight standing', async () => {
    const { a } = ids()
    const list = [thread(a, '2026-10-08T10:00:00Z')]
    const r = reader()
    const leave = enlist(r)
    const pin = answer<Thread>()
    const rename = answer<Thread>()
    const pinning = attempt(list[0], { pinned: true }, pin.send)
    const renaming = attempt({ ...list[0], pinned: true }, { title: 'Renamed' }, rename.send)
    expect(view(list, r.at, false)[0]).toMatchObject({ pinned: true, title: 'Renamed' })
    // The rename waits for the pin's answer before it is asked.
    await settle()
    expect(rename.asked).toBe(false)
    pin.ok({ ...list[0], pinned: true })
    await pinning
    await settle()
    expect(rename.asked).toBe(true)
    rename.no(new Error('Titles are one line.'))
    await expect(renaming).rejects.toThrow('Titles are one line.')
    expect(view(list, r.at, false)[0]).toMatchObject({ pinned: true, title: a })
    leave()
  })

  test('a refused pin takes back only itself, and the change after it still goes', async () => {
    const { a } = ids()
    const list = [thread(a, '2026-10-08T10:00:00Z')]
    const r = reader()
    const leave = enlist(r)
    const pin = answer<Thread>()
    const rename = answer<Thread>()
    const pinning = attempt(list[0], { pinned: true }, pin.send)
    const renaming = attempt({ ...list[0], pinned: true }, { title: 'Renamed' }, rename.send)
    pin.no(new Error('refused'))
    await expect(pinning).rejects.toThrow('refused')
    expect(view(list, r.at, false)[0]).toMatchObject({ title: 'Renamed' })
    expect(view(list, r.at, false)[0].pinned).toBeFalsy()
    await settle()
    expect(rename.asked).toBe(true)
    rename.ok({ ...list[0], title: 'Renamed' })
    await renaming
    expect(view(list, r.at, false)[0]).toMatchObject({ title: 'Renamed' })
    leave()
  })

  test('two toggles are asked one after the other, so the last one asked is the one that stands', async () => {
    const { a } = ids()
    const list = [thread(a, '2026-10-08T10:00:00Z', { pinned: false })]
    const r = reader()
    const leave = enlist(r)
    const on = answer<Thread>()
    const off = answer<Thread>()
    const pinning = attempt(list[0], { pinned: true }, on.send)
    const unpinning = attempt({ ...list[0], pinned: true }, { pinned: false }, off.send)
    expect(view(list, r.at, false)[0].pinned).toBe(false)
    await settle()
    // The second is not asked until the first is answered: they cannot cross.
    expect(on.asked).toBe(true)
    expect(off.asked).toBe(false)
    on.ok({ ...list[0], pinned: true })
    await pinning
    expect(view(list, r.at, false)[0].pinned).toBe(false)
    await settle()
    expect(off.asked).toBe(true)
    off.ok({ ...list[0], pinned: false })
    await unpinning
    expect(view(list, r.at, false)[0].pinned).toBe(false)
    leave()
  })
})

describe('a settled change', () => {
  test('lies over a list read before the store answered, never over one read after, and goes once every list has read', async () => {
    const { a } = ids()
    const before = [thread(a, '2026-10-08T10:00:00Z')]
    const early = reader()
    const leave = enlist(early)
    const store = answer<Thread>()
    const done = attempt(before[0], { title: 'mine' }, store.send)
    // The store answers with its own spelling of the change, which is the one shown.
    store.ok({ ...before[0], title: 'Mine' })
    await done
    // Every list on the page was asked to read again.
    expect(early.asked).toBe(1)
    // Its old read still shows the change, not the row as it was.
    expect(view(before, early.at, false)[0].title).toBe('Mine')
    // A read asked for after the answer is the store's own, whatever it says.
    const fresh = tick()
    expect(view([{ ...before[0], title: 'Theirs' }], fresh, false)[0].title).toBe('Theirs')
    // Once every list has read after it, the change is gone.
    early.at = fresh
    const held = snapshot()
    sweep()
    expect(snapshot()).toBeGreaterThan(held)
    expect(view(before, 0, false)).toEqual(before)
    leave()
  })

  test('folds into the thread a later change is laid over, so an archived row is not drawn back on the active shelf', async () => {
    const { a } = ids()
    const row = thread(a, '2026-10-08T10:00:00Z')
    const r = reader()
    const leave = enlist(r)
    await attempt(row, { archived: true }, () => Promise.resolve({ ...row, archived: true }))
    // The active list reads after the archive: the row is not in it, and the archived shelf has it.
    r.at = tick()
    sweep()
    const rename = answer<Thread>()
    const renaming = attempt({ ...row, archived: true }, { title: 'Renamed' }, rename.send)
    expect(view([], r.at, false)).toEqual([])
    expect(view([{ ...row, archived: true }], r.at, true)[0]).toMatchObject({ title: 'Renamed', archived: true })
    rename.ok({ ...row, archived: true, title: 'Renamed' })
    await renaming
    leave()
  })

  test('with no list on the page there is nothing to hold it for', async () => {
    const { a } = ids()
    const list = [thread(a, '2026-10-08T10:00:00Z')]
    await attempt(list[0], { pinned: true }, () => Promise.resolve({ ...list[0], pinned: true }))
    expect(view(list, 0, false)).toEqual(list)
  })
})

describe('another client', () => {
  test('draws nothing asked under the last one', async () => {
    const { a } = ids()
    const list = [thread(a, '2026-10-08T10:00:00Z')]
    const one = {}
    bind(one)
    const store = answer<Thread>()
    const done = attempt(list[0], { pinned: true }, store.send)
    expect(view(list, 0, false)[0].pinned).toBe(true)
    bind(one)
    expect(view(list, 0, false)[0].pinned).toBe(true)
    bind({})
    expect(view(list, 0, false)).toEqual(list)
    store.ok({ ...list[0], pinned: true })
    await done
    expect(view(list, 0, false)).toEqual(list)
  })
})
