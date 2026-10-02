/**
 * A scroller that does not draw its scrollbar, as a gui prop: a row of chips or
 * tabs scrolls sideways under a finger or a trackpad, and a bar under it would
 * be chrome around nothing. gui applies `scrollbarWidth` on the web and its
 * types do not list it, so it is spread rather than written.
 */
export const bare = { scrollbarWidth: 'none' } as const
