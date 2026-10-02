// Fully specify every relative import tsc emitted.
//
// The source writes `./lib/api`, which a bundler resolves and Node's ESM loader
// refuses: a host that runs these modules outside a bundler — a test runner, a
// prerender worker — dies on `Cannot find module …/lib/api`. Each relative
// specifier in dist becomes the file tsc actually wrote: `./x.js`, or
// `./x/index.js` for a directory.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
const SPEC = /((?:from|import)\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+)\2/g

let rewritten = 0
for (const file of walk(DIST)) {
  if (!file.endsWith('.js') && !file.endsWith('.d.ts')) continue
  const src = readFileSync(file, 'utf8')
  const out = src.replace(SPEC, (all, kw, q, spec) => {
    if (/\.(js|json|css)$/.test(spec)) return all
    const at = join(dirname(file), spec)
    const to = existsSync(`${at}.js`) ? `${spec}.js` : existsSync(join(at, 'index.js')) ? `${spec}/index.js` : null
    if (!to) throw new Error(`${file}: ${spec} names no emitted module`)
    rewritten++
    return `${kw}${q}${to}${q}`
  })
  if (out !== src) writeFileSync(file, out)
}
console.log(`specifiers: ${rewritten} relative imports fully specified`)
