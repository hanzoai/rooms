// The controls and surfaces the Bots room is drawn from, as gui props.
//
// The room and its runtime pane spelled the same tab, field and label twice
// each; they are stated once here and spread where they are drawn. Each is a
// plain prop object, so a call site adds to one and never needs a style.

import { DIM, FAINT, INK, LINE, RAISED, SURFACE } from './ink'

/** A bare icon control: no ground, a 6px pad, the glyph centred. The glyph
 *  takes its ink itself — a frame carries no text colour to hand down. */
export const GHOST = {
  render: 'button', type: 'button', p: 6, rounded: 6, bg: 'transparent', borderWidth: 0,
  items: 'center', justify: 'center', cursor: 'pointer',
} as const

/** The small outlined control every action here is. A `Text`, so the label's
 *  size and ink are the button's and an icon beside it paints in `currentColor`. */
export const TAB = {
  render: 'button', type: 'button', display: 'inline-flex', items: 'center', gap: 5, px: 10, py: 5, rounded: 7,
  fontSize: '$1', fontWeight: '600', borderWidth: 1, borderColor: LINE, bg: 'transparent', color: DIM, cursor: 'pointer',
} as const

/** A field with its chrome off, inside a row that draws the edge. Its padding
 *  is still @hanzo/design's base field gutter. */
export const BARE = { unstyled: true, color: INK, placeholderTextColor: '$placeholderColor' } as const

/** A field that draws its own edge. */
export const BOXED = {
  unstyled: true, width: '100%', px: 10, py: 7, rounded: 8, bg: SURFACE, borderWidth: 1, borderColor: LINE,
  color: INK, fontSize: '$2', placeholderTextColor: '$placeholderColor',
} as const

/** The platform's select, wearing the same edge as `BOXED`. */
export const PICK = { width: '100%', rounded: 8, bg: SURFACE, borderColor: LINE, color: INK, fontSize: '$2' } as const

/** A raised card in the stream. */
export const CARD = { bg: RAISED, borderWidth: 1, borderColor: LINE, rounded: 14, p: 16, gap: 8, maxW: 620 } as const

/** A section's small-caps heading. */
export const LABEL = {
  render: 'h3', fontSize: '$1', fontWeight: '600', letterSpacing: 0.6, color: FAINT, textTransform: 'uppercase',
} as const

/** A sentence the room says when it has nothing else to draw. */
export const NOTE = { render: 'p', px: 12, py: 10, fontSize: '$2', lineHeight: '1.3rem', color: DIM } as const

/** One line, cut with an ellipsis where it runs out of room. */
export const CLIP = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const

/** What a run printed: a bounded block of mono that scrolls. */
export const OUT = {
  render: 'pre', display: 'block', maxH: 180, overflowY: 'auto', p: 10, rounded: 8, bg: SURFACE, borderWidth: 1,
  borderColor: LINE, fontFamily: '$mono', fontSize: '$1', lineHeight: '1.03125rem', whiteSpace: 'pre-wrap', color: INK,
} as const
