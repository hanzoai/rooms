// The ramp this room is drawn in.
//
// Greyscale, because nothing on this screen is a category: a Bot is not red and
// a session is not green. What used to stand here was seven personas each given
// a colour from a table in the source, which told a reader which of seven
// fictional workers they were looking at and could not survive the eighth.
//
// Status is said in words. A colour that means "done" has to be learned; the
// word does not, and it survives a reader who cannot see it.
//
// ROLES, NOT VALUES. These were seven literals — black ground, white ink, white
// at four opacities — which reads right in dark by coincidence and cannot
// retune. On the light theme the room came out an island: the rail and the
// column beside it followed the page while everything these painted stayed
// night, which is also what a screenshot of the room then carried onto the
// landing. Naming the role hands the decision to @hanzo/design, which tunes
// both grounds already.
//
// The loud controls are @hanzo/ui's primary Button, so their fill is design's
// accent and follows whatever @hanzo/appearance sets; this ramp holds no pair.

export const GROUND = 'var(--background)'
export const RAISED = 'var(--surface-1)'
export const INK = 'var(--foreground)'
export const DIM = 'var(--muted-foreground)'
// The dimmest ink is gui's `$faint` rung, a theme token: design's
// --text-tertiary is 4.32:1 on the light ground, under text's 4.5.
export const FAINT = '$faint'
export const LINE = 'var(--border)'
export const SURFACE = 'var(--surface-card-quiet)'
