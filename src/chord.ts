// The keys that act on a conversation: Ctrl+Alt+R renames it, Ctrl+Alt+P pins
// or unpins it — the one whose menu is open, or else the one the pane holds.
// Never while the reader is typing: the same keys in a field are the field's.
// No React, so a spec reads it as it is.

export type Act = 'rename' | 'pin'

/** The physical key, so a layout or Option's dead keys (⌥R is "®" on a Mac) do not change it. */
const KEYS: Record<string, Act> = { KeyR: 'rename', KeyP: 'pin' }

/** The part of a keydown this reads. */
export interface Press {
  code?: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  shiftKey: boolean
  isComposing?: boolean
  target: EventTarget | null
}

/** Whether a key pressed on `target` is typing: a field, a picker, or text that edits itself. */
export function typing(target: EventTarget | null): boolean {
  const el = target as (Partial<HTMLElement> & { tagName?: string }) | null
  if (!el || typeof el !== 'object') return false
  if (el.isContentEditable) return true
  const tag = (el.tagName ?? '').toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return typeof el.closest === 'function' && el.closest('[contenteditable=""],[contenteditable="true"],[role="textbox"]') !== null
}

/** What a keydown asks of a conversation, or null when it asks nothing of one. */
export function chord(e: Press): Act | null {
  if (!e.ctrlKey || !e.altKey || e.metaKey || e.shiftKey || e.isComposing) return null
  const act = KEYS[e.code ?? '']
  if (!act || typing(e.target)) return null
  return act
}

/** A chord as a menu prints it: ⌃⌥R on a Mac, Ctrl+Alt+R elsewhere. */
export function said(act: Act, mac: boolean): string {
  const key = act === 'rename' ? 'R' : 'P'
  return mac ? `⌃⌥${key}` : `Ctrl+Alt+${key}`
}
