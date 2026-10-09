import { describe, expect, test } from 'vitest'
import { chord, named, said, typing, type Press } from './chord'

const on = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, closest: () => null, ...extra }) as unknown as EventTarget

const press = (key: string, code: string, extra: Partial<Press> = {}): Press => ({
  key,
  code,
  ctrlKey: true,
  altKey: true,
  metaKey: false,
  shiftKey: false,
  target: on('DIV'),
  ...extra,
})

describe('the keys a conversation answers to', () => {
  test('Ctrl+Alt+R renames and Ctrl+Alt+P pins', () => {
    expect(chord(press('r', 'KeyR'))).toBe('rename')
    expect(chord(press('p', 'KeyP'))).toBe('pin')
    expect(chord(press('q', 'KeyQ'))).toBeNull()
  })

  test('the letter on the key, whatever the layout', () => {
    // Dvorak: the key labelled P sits where QWERTY's R is.
    expect(chord(press('p', 'KeyR'))).toBe('pin')
    expect(chord(press('r', 'KeyO'))).toBe('rename')
    expect(chord(press('R', 'KeyR'))).toBe('rename')
  })

  test("the key's place, where Option or AltGr made it another character", () => {
    expect(chord(press('®', 'KeyR'))).toBe('rename')
    expect(chord(press('π', 'KeyP'))).toBe('pin')
    expect(chord(press('Dead', 'KeyQ'))).toBeNull()
  })

  test('both modifiers and no others', () => {
    expect(chord(press('r', 'KeyR', { altKey: false }))).toBeNull()
    expect(chord(press('r', 'KeyR', { ctrlKey: false }))).toBeNull()
    expect(chord(press('r', 'KeyR', { metaKey: true }))).toBeNull()
    expect(chord(press('p', 'KeyP', { shiftKey: true }))).toBeNull()
    expect(chord(press('r', 'KeyR', { isComposing: true }))).toBeNull()
  })

  test('once a press: a held key repeats, and the repeats ask nothing', () => {
    expect(chord(press('p', 'KeyP', { repeat: true }))).toBeNull()
    expect(chord(press('p', 'KeyP', { repeat: false }))).toBe('pin')
  })

  test('never while typing: a field, a text area, a picker, or text that edits itself', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) expect(chord(press('r', 'KeyR', { target: on(tag) }))).toBeNull()
    expect(chord(press('p', 'KeyP', { target: on('DIV', { isContentEditable: true }) }))).toBeNull()
    // Inside a composer whose box is a role="textbox".
    const inside = on('SPAN', { closest: (q: string) => (q.includes('role="textbox"') ? {} : null) })
    expect(chord(press('p', 'KeyP', { target: inside }))).toBeNull()
    expect(typing(on('BUTTON'))).toBe(false)
    expect(typing(null)).toBe(false)
  })

  test('never inside a dialog: its keys are its own', () => {
    for (const role of ['dialog', 'alertdialog']) {
      const inside = on('BUTTON', { closest: (q: string) => (q.includes(`role="${role}"`) ? {} : null) })
      expect(chord(press('r', 'KeyR', { target: inside }))).toBeNull()
    }
  })

  test('printed the way the platform says it, and named for assistive technology one way', () => {
    expect(said('rename', true)).toBe('⌃⌥R')
    expect(said('pin', true)).toBe('⌃⌥P')
    expect(said('rename', false)).toBe('Ctrl+Alt+R')
    expect(said('pin', false)).toBe('Ctrl+Alt+P')
    expect(named('rename')).toBe('Control+Alt+R')
    expect(named('pin')).toBe('Control+Alt+P')
  })
})
