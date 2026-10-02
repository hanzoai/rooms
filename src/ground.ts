/**
 * The ground the workspace's cards stand on, and how each card is cut.
 *
 * A PANE is a card floating on the ground, cut by the `--pane-*` tokens
 * (app/globals.css): a corner, an edge, the lens behind it, and the second
 * paper rung's lit edge and drop. The fill is the caller's rung: `--pane-fill`
 * in the app's frame, `sheet(1)`/`sheet(2)` where a pane lies in a room.
 *
 * The drop is a prop and not `sheet(2)`'s `elevation-2` class, whose shadow is
 * `!important`: a Dev run's pane steps aside for the two panes inside it by
 * slot (@hanzo/build's `run-split`), and an important shadow would stay behind.
 */
export const pane = (fill = 'var(--pane-fill)') =>
  ({
    backgroundColor: fill,
    borderRadius: 'var(--pane-round)',
    borderWidth: 1,
    borderColor: 'var(--pane-edge)',
    backdropFilter: 'var(--pane-blur)',
    boxShadow: 'var(--shadow-sheet-2)',
  }) as const

/**
 * THE FLOOR under the app's frame (app/_web.tsx, components/settings/Frame.tsx):
 * design's top light falling off down the window over the faint lamps of
 * `--pane-ground`. A straight fall rather than a radial glow, because at these
 * alphas a circle quantises into rings a blur makes plainer.
 */
export const floor = {
  backgroundColor: 'var(--pane-floor)',
  backgroundImage: 'linear-gradient(to bottom, var(--glass-strong), transparent), var(--pane-ground)',
  backgroundSize: '100% 70%, auto',
  backgroundRepeat: 'no-repeat',
} as const
