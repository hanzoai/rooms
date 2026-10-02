// What a message says, as it was written.
//
// A model answers in markdown — fences, lists, emphasis, tables — and this app
// drew that as literal characters: an answer arrived reading "```ts" and three
// backticks stayed on screen. Three surfaces then each grew their own half of a
// renderer, and all three were the same regex pair (fences, newlines) with no
// escaping inside the fence, so a code block containing a tag lost the tag.
//
// One reader, and `marked` is the one the site already parses its legal
// documents with — same engine, same dialect, so a fence means the same thing
// wherever it is written. This file READS: it turns a message into marked's
// tokens. `components/workspace/Prose.tsx` draws them in gui elements.
//
// SAFE BY CONSTRUCTION RATHER THAN BY CLEANUP. Nothing here or in the drawing
// produces markup from the text: every leaf is a string React escapes, raw HTML
// is shown as the text somebody typed, and a link keeps only a scheme a message
// is allowed to carry. The same tokens come out on the server and in the
// browser, which is also what keeps hydration quiet.

import { Lexer, type Token, type Tokens } from 'marked'

export type { Token, Tokens }

/** GitHub's dialect, and a single newline is a line break: a model breaks a
 *  line where it means one. */
const DIALECT = { gfm: true, breaks: true }

/** One message's text as marked's block tokens. Empty in, empty out — a caller
 *  rendering a streaming turn asks this on every token and the first is nothing. */
export function read(text: string): Token[] {
  if (!text) return []
  return Lexer.lex(text, DIALECT)
}

/** Schemes a message may link to. Anything else — `javascript:`, `data:`,
 *  `vbscript:` — is a script delivered as a destination, so the text stays and
 *  the link does not. A relative or fragment href resolves to this page's own
 *  scheme and is kept. */
const SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/** An href read the way a browser reads it: every tab, newline and carriage
 *  return removed wherever it stands, and control characters and spaces removed
 *  from both ends (WHATWG URL parsing). `\x01javascript:` is `javascript:` to a
 *  browser, so it has to be `javascript:` to the allowlist too. */
const TAB_OR_NEWLINE = /[\t\n\r]/g
const EDGES = /^[\u0000- ]+|[\u0000- ]+$/g

/** The page a relative href is resolved against. Its origin is no site's, so an
 *  href that stays on it is one that stays on whatever site renders it. */
const HERE = new URL('https://here.invalid/')

/** The href a link may carry, or null when it may carry none. Parsed with URL,
 *  so the scheme judged is the scheme a browser would follow, and a link is
 *  away whenever it would leave the page's origin — `//host`, `/\host` and
 *  `https:host` included, however the address is spelled. */
export function destination(href: string): { href: string; away: boolean } | null {
  const bare = href.replace(TAB_OR_NEWLINE, '').replace(EDGES, '')
  if (/[\u0000-\u001f\u007f]/.test(bare)) return null
  let url: URL
  try {
    url = new URL(bare, HERE)
  } catch {
    return null
  }
  if (!SCHEMES.has(url.protocol)) return null
  return { href: bare, away: url.origin !== HERE.origin }
}
