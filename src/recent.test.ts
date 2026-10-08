import { describe, expect, test } from 'vitest'
import { arrange, chats, MENUS, PINNED, PLAIN, viewOf } from './recent'

const now = new Date('2026-10-08T12:00:00Z')
const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString()

const rows = chats([
  { id: 'a', title: 'Aurora', updatedAt: at(1) },
  { id: 'b', title: 'Borealis', updatedAt: at(50), pinned: true },
  { id: 'c', title: 'Comet', updatedAt: at(2) },
  { id: 'd', title: 'Dune', updatedAt: at(3), pinned: true },
])

describe('Recents', () => {
  test('pinned conversations come first, under Pinned, in the order the view sorts them', () => {
    const groups = arrange(rows, PLAIN, '', now)
    expect(groups[0]).toEqual({ title: PINNED, rows: [rows[3], rows[1]] })
    expect(groups.slice(1).flatMap((g) => g.rows.map((r) => r.id))).toEqual(['a', 'c'])
    expect(groups.slice(1).some((g) => g.title === PINNED)).toBe(false)
  })

  test('a view grouped by None still lists the pinned ones first', () => {
    const groups = arrange(rows, { ...PLAIN, group: 'none' }, '', now)
    expect(groups.map((g) => g.title)).toEqual([PINNED, ''])
    expect(groups[1].rows.map((r) => r.id)).toEqual(['a', 'c'])
  })

  test('words narrow the pinned ones too, and an empty Pinned is no group', () => {
    expect(arrange(rows, PLAIN, 'aur', now)).toEqual([{ title: 'Today', rows: [rows[0]] }])
  })

  test('an archived conversation reads as archived, and the archived view keeps it', () => {
    const away = chats([{ id: 'e', title: 'Eclipse', updatedAt: at(5), archived: true }])
    expect(away[0].status).toBe('archived')
    expect(arrange(away, { ...PLAIN, status: 'archived' }, '', now).flatMap((g) => g.rows)).toEqual(away)
  })

  test("Chat's Status is whether a conversation is archived, and there is no Starred group", () => {
    expect(MENUS.chat.status.map((o) => o.id)).toEqual(['all', 'archived'])
    expect(MENUS.chat.group.map((o) => o.id)).toEqual(['date', 'none'])
    // A view kept before the pin replaced the star reads as the plain one: nothing is migrated.
    expect(viewOf('chat', { group: 'starred' })).toEqual(PLAIN)
    expect(viewOf('chat', { status: 'archived' }).status).toBe('archived')
    expect(viewOf('dev', { status: 'archived' }).status).toBe('all')
  })
})
