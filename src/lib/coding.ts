import { bearer as held, scope } from './session'
import { api } from './api'
/**
 * Starting a coding run, and choosing WHERE it runs.
 *
 * The contract, read off the served document rather than assumed:
 *  - start   POST /v1/agents/coding   → 202 {sessionId, repo, branch, routed, targetId}
 *  - targets GET  /v1/agents/targets  → {targets: [...]}
 *
 * WHERE A RUN RUNS IS ONE FIELD. Omit `targetId` and the run goes to the cloud's
 * own sandbox; name one and it is routed to a machine the org has claimed. The
 * answer comes back rather than being assumed: `routed` says whether it reached
 * a machine, and `targetId` says which. A caller that asked for a machine and
 * reads `routed: false` was given a sandbox instead, and should say so rather
 * than draw a screen that claims otherwise.
 *
 * That is the whole of the web-vs-desktop question. A browser has no machine to
 * offer, so it sends no target and gets a sandbox. A surface running ON a
 * claimed machine sends that machine's id. Neither needs a second endpoint, and
 * nothing here sniffs the user agent to decide — the caller says what it has.
 *
 * A refusal states its reason: 401 is the credential and 403 is permission, and
 * neither is "try again", so neither says it.
 *
 * AND IT REACHES THE READER, which for a while it did not. On localhost this
 * caught every refusal it had just raised and answered with a fabricated
 * accepted run — `sessionId: 'ses_' + Math.random()` — plus two invented
 * targets, and `token()` minted `hz_local_dev_token` for a reader who was not
 * signed in. So the one machine the acceptance gate is run on was the one where
 * a platform that was down, unauthenticated or 500ing still opened a run, wrote
 * `?run=` and mounted live Pause/Resume/Stop over nothing. Measured: the same
 * prompt twice returned two different ids, which a served id cannot do.
 *
 * `Start.tsx` already renders `e.message` beside the composer. Point
 * NEXT_PUBLIC_HANZO_API_URL at a platform that answers; do not synthesise one.
 */

/** What a coding run answers with. 202 — accepted, not finished. */
export interface CodingRun {
  /** The session every surface hangs this run's activity off. */
  sessionId: string
  repo: string
  /** The branch the run works on; the server picks one when `base` is empty. */
  branch: string
  /** Whether it reached a claimed machine. False means the sandbox took it. */
  routed: boolean
  /** Which machine, when one took it. Empty for a sandbox run. */
  targetId: string
}

/** A machine the org has claimed, as `/v1/agents/targets` lists it. */
export interface Target {
  /** `tgt_` + 32 hex. What a run names to route here. */
  id: string
  /** The name a person gave it ("workshop"). */
  label: string
  /** laptop | cloud | … — a closed set the server owns. */
  kind: string
  /** EFFECTIVE liveness: online | offline | draining. */
  status: string
  /** Human summary — "8 vCPU / 32G", "1× GB10". */
  capacity?: string
  host?: string
  /** How many of the org's sessions map here, and how many are running now. */
  sessions?: number
  running?: number
}

export interface StartCoding {
  /** The task, in the words you would use with a colleague. */
  prompt: string
  /** Model to route the coding agent through. */
  model?: string
  /** `owner/name` in the caller's own org. */
  repo?: string
  /** dev | claude | codex | python — which harness runs the prompt. */
  tool?: string
  /** The branch to start from. Empty takes the repository's default. */
  base?: string
  /**
   * Route to a claimed machine. OMITTED IS THE SANDBOX, and that is the default
   * on the web deliberately: a browser has no machine to offer.
   */
  targetId?: string
  /** Ask for a run with a screen — an image carrying an X server. */
  desktop?: boolean
}

export class CodingRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function token(): string | null {
  return held()
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const tok = token()
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (tok && !headers.has('Authorization')) {
    for (const [k, v] of Object.entries(scope())) if (!headers.has(k)) headers.set(k, v)
  }
  const res = await fetch(`${api()}${path}`, {
    ...init,
    // A run is a fact about right now, and a cached refusal survives the fix —
    // it reads as the system still being broken long after it is not.
    cache: 'no-store',
    headers,
  })
  if (res.status === 401 && tok) throw new CodingRefusal(401, 'Your session expired — sign in again')
  if (res.status === 401 && !tok) throw new CodingRefusal(401, 'Sign in or use Free AI to start a run')
  if (res.status === 403) throw new CodingRefusal(403, 'Your role cannot start runs in this organization')
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: { message?: string }; msg?: string }
      detail = body?.error?.message || body?.msg || ''
    } catch {
      // A refusal with no JSON body is still a refusal; the status carries it.
    }
    throw new CodingRefusal(res.status, detail || `Could not start the run (${res.status})`)
  }
  return res.json()
}

/**
 * Starts one autonomous coding run and answers the session it opened.
 *
 * 202, not 200: the run is ACCEPTED here and finishes later, so what comes back
 * is where to watch it — `sessionId` is the row the working view already
 * renders — and never its output.
 */
export async function startCoding(params: StartCoding): Promise<CodingRun> {
  const body = await call('/v1/agents/coding', { method: 'POST', body: JSON.stringify(params) })
  const r = (body ?? {}) as Partial<CodingRun>
  if (!r.sessionId) {
    // Accepted with no session is not a run anybody can watch. Say so rather
    // than hand back a half-value the caller will render as success.
    throw new CodingRefusal(502, 'The run was accepted but named no session')
  }
  return {
    sessionId: r.sessionId,
    repo: r.repo ?? '',
    branch: r.branch ?? '',
    routed: r.routed ?? false,
    targetId: r.targetId ?? '',
  }
}

export const startRun = startCoding


/**
 * The machines this org has claimed.
 *
 * An empty list is an ANSWER — this org has claimed none, so every run goes to
 * a sandbox — and is not an error. A refusal still throws, because "we could
 * not ask" and "there are none" must not render the same.
 */
export async function listTargets(): Promise<Target[]> {
  const body = await call('/v1/agents/targets', { method: 'GET' })
  const t = (body as { targets?: Target[] } | null)?.targets
  return Array.isArray(t) ? t : []
}

/** A machine can take a run only while it is online. */
export const dispatchable = (t: Target): boolean => t.status === 'online'
