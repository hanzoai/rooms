import { describe, expect, test } from 'vitest'
import type { Thread } from '@hanzo/ai'
import { attempt, enlist, snapshot, sweep, tick, view, type Reader } from './pending'

// Each test names its own conversations, so the changes one leaves settled
// cannot reach another's lists.
let n = 0
const ids = () => {
  n++
  return { a: `${n}-a`, b: `${n}-b`, c: `${n}-c` }
}

const thread = (id: string, at: string, extra: Partial<Thread> = {}): Thread => ({ id, title: id, updatedAt: at, ...extra })

/** A store answer the test settles by hand. */
function answer<T>() {
  let ok!: (v: T) => void
  let no!: (e: Error) => void
  const promise = new Promise<T>((resolve, reject) => {
    ok = resolve
    no = reject
  })
  return { promise, ok, no }
}

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
    const done = attempt(b, { ...list[1], pinned: true, title: 'Borealis' }, () => store.promise)
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
    const deleting = attempt(a, null, () => gone.promise)
    const archiving = attempt(b, { ...active[1], archived: true }, () => away.promise)
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
    const done = attempt(a, { ...list[0], pinned: true }, () => store.promise)
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
    const done = attempt(a, null, () => store.promise)
    expect(view(list, 0, false).map((t) => t.id)).toEqual([b])
    store.no(new Error('offline'))
    await expect(done).rejects.toThrow('offline')
    expect(view(list, 0, false).map((t) => t.id)).toEqual([a, b])
  })
})

describe('a settled change', () => {
  test('lies over a list read before the store answered, never over one read after, and goes once every list has read', async () => {
    const { a } = ids()
    const before = [thread(a, '2026-10-08T10:00:00Z')]
    const early = reader()
    const leave = enlist(early)
    const store = answer<Thread>()
    const done = attempt(a, { ...before[0], title: 'mine' }, () => store.promise)
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

  test('a later change to the same conversation stands when the earlier one is refused', async () => {
    const { a } = ids()
    const list = [thread(a, '2026-10-08T10:00:00Z')]
    const first = answer<Thread>()
    const second = answer<Thread>()
    const r = reader()
    const leave = enlist(r)
    const pinning = attempt(a, { ...list[0], pinned: true }, () => first.promise)
    const renaming = attempt(a, { ...list[0], pinned: true, title: 'Renamed' }, () => second.promise)
    first.no(new Error('refused'))
    await expect(pinning).rejects.toThrow('refused')
    expect(view(list, r.at, false)[0]).toMatchObject({ pinned: true, title: 'Renamed' })
    // The store kept only the rename, and says so: that is what shows.
    second.ok({ ...list[0], title: 'Renamed', pinned: false })
    await renaming
    expect(view(list, r.at, false)[0]).toMatchObject({ title: 'Renamed' })
    expect(view(list, r.at, false)[0].pinned).toBeFalsy()
    leave()
  })

  test('with no list on the page there is nothing to hold it for', async () => {
    const { a } = ids()
    const list = [thread(a, '2026-10-08T10:00:00Z')]
    await attempt(a, { ...list[0], pinned: true }, () => Promise.resolve({ ...list[0], pinned: true }))
    expect(view(list, 0, false)).toEqual(list)
  })
})
