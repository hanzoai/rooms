/**
 * A standalone tap target, as gui props: a box with its content in a row, and
 * 44px on its smaller side under a coarse pointer (WCAG 2.5.5, a thumb). A
 * mouse keeps the control's own size. A link inside a sentence is not one —
 * stretching it to 44px would tear the line it sits in.
 *
 * Spread it on the gui element that is the control: `<XStack render="a" {...tap}>`.
 */
export const tap = { display: 'inline-flex', flexDirection: 'row', items: 'center', $touchable: { minH: 44, minW: 44 } } as const
