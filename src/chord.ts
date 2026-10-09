// The keys that act on a conversation: Ctrl+Alt+R renames it, Ctrl+Alt+P pins
// or unpins it — the one whose menu is open, or else the one the pane holds.
// Never while the reader is typing or a dialog holds the keys, and once a press:
// a held key repeats, and a held Ctrl+Alt+P would toggle the pin thirty times a
// second. No React, so a spec reads it as it is.

export type Act = 'rename' | 'pin'

const LETTERS: Record<string, Act> = { r: 'rename', p: 'pin' }

/** The part of a keydown this reads. */
export interface Press {
  key?: string
  code?: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  shiftKey: boolean
  repeat?: boolean
  isComposing?: boolean
  target: EventTarget | null
}

type Target = (Partial<HTMLElement> & { tagName?: string }) | null

/** Whether `target` sits inside something matching `selector`. */
const within = (target: EventTarget | null, selector: string): boolean => {
  const el = target as Target
  return Boolean(el && typeof el === 'object' && typeof el.closest === 'function' && el.closest(selector) !== null)
}

/** Whether a key pressed on `target` is typing: a field, a picker, or text that edits itself. */
export function typing(target: EventTarget | null): boolean {
  const el = target as Target
  if (!el || typeof el !== 'object') return false
  if (el.isContentEditable) return true
  const tag = (el.tagName ?? '').toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return within(target, '[contenteditable=""],[contenteditable="true"],[role="textbox"]')
}

/**
 * The letter a key press names: the one on the key, whatever the layout (the
 * labelled P is where QWERTY's R is on Dvorak), or — where Option or AltGr made
 * it another character, ⌥R being "®" on a Mac — the key's place.
 */
function letter(e: Press): string | null {
  if (e.key && /^[a-z]$/i.test(e.key)) return e.key.toLowerCase()
  const place = /^Key([A-Z])$/.exec(e.code ?? '')
  return place ? place[1].toLowerCase() : null
}

/** What a keydown asks of a conversation, or null when it asks nothing of one. */
export function chord(e: Press): Act | null {
  if (!e.ctrlKey || !e.altKey || e.metaKey || e.shiftKey || e.repeat || e.isComposing) return null
  const l = letter(e)
  const act = l ? LETTERS[l] : undefined
  if (!act || typing(e.target) || within(e.target, '[role="dialog"],[role="alertdialog"]')) return null
  return act
}

/** A chord as a menu prints it: ⌃⌥R on a Mac, Ctrl+Alt+R elsewhere. */
export function said(act: Act, mac: boolean): string {
  const key = act === 'rename' ? 'R' : 'P'
  return mac ? `⌃⌥${key}` : `Ctrl+Alt+${key}`
}

/** A chord as `aria-keyshortcuts` says it, the same on every platform. */
export const named = (act: Act): string => `Control+Alt+${act === 'rename' ? 'R' : 'P'}`
