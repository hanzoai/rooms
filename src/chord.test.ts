import { describe, expect, test } from 'vitest'
import { chord, said, typing, type Press } from './chord'

const on = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, ...extra }) as unknown as EventTarget

const press = (code: string, extra: Partial<Press> = {}): Press => ({
  code,
  ctrlKey: true,
  altKey: true,
  metaKey: false,
  shiftKey: false,
  target: on('DIV'),
  ...extra,
})

describe('the keys a conversation answers to', () => {
  test('Ctrl+Alt+R renames and Ctrl+Alt+P pins, by the physical key', () => {
    expect(chord(press('KeyR'))).toBe('rename')
    expect(chord(press('KeyP'))).toBe('pin')
    expect(chord(press('KeyQ'))).toBeNull()
  })

  test('both modifiers and no others', () => {
    expect(chord(press('KeyR', { altKey: false }))).toBeNull()
    expect(chord(press('KeyR', { ctrlKey: false }))).toBeNull()
    expect(chord(press('KeyR', { metaKey: true }))).toBeNull()
    expect(chord(press('KeyP', { shiftKey: true }))).toBeNull()
    expect(chord(press('KeyR', { isComposing: true }))).toBeNull()
  })

  test('never while typing: a field, a text area, a picker, or text that edits itself', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) expect(chord(press('KeyR', { target: on(tag) }))).toBeNull()
    expect(chord(press('KeyP', { target: on('DIV', { isContentEditable: true }) }))).toBeNull()
    // Inside a composer whose box is a role="textbox".
    const inside = on('SPAN', { closest: (q: string) => (q.includes('role="textbox"') ? {} : null) })
    expect(chord(press('KeyP', { target: inside }))).toBeNull()
    expect(typing(on('BUTTON', { closest: () => null }))).toBe(false)
    expect(typing(null)).toBe(false)
  })

  test('printed the way the platform says it', () => {
    expect(said('rename', true)).toBe('⌃⌥R')
    expect(said('pin', true)).toBe('⌃⌥P')
    expect(said('rename', false)).toBe('Ctrl+Alt+R')
    expect(said('pin', false)).toBe('Ctrl+Alt+P')
  })
})
