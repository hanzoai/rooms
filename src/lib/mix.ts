/**
 * A colour mixed down to a share of itself, for a gui colour prop.
 *
 * gui hands a `color-mix()` to the page unchanged; its types only name custom
 * properties, so the value is typed as one.
 */
export const mix = (ink: string, share: number, space: 'oklab' | 'srgb' = 'oklab') =>
  `color-mix(in ${space}, ${ink} ${share}%, transparent)` as `var(--${string})`

/**
 * A state hue set as text: the hue mixed toward the theme's own ink.
 *
 * design's state colours are one value in both themes: `--state-success` is
 * 2.1:1 on the light paper, and `--destructive` is a FILL (red-600, cut for the
 * white label on it) that reads 4.1:1 as text on the dark ground. Mixed toward
 * `--foreground` they darken on light and lighten on dark, and hold 4.5:1 on
 * either theme's panes (measured on /meet and /drive) while still reading as
 * the hue.
 */
export const hue = (ink: string, share: number) =>
  `color-mix(in srgb, ${ink} ${share}%, var(--foreground))` as `var(--${string})`

/** Success, said in text. */
export const GOOD = hue('var(--state-success)', 55)
/** A destructive action's word. */
export const BAD = hue('var(--destructive)', 70)
