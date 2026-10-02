/**
 * Hanzo Tasks — the durable execution engine — as the board reaches it.
 *
 * TWO SUBSYSTEMS, ONE SEAM, and the seam is the point. `/v1/todo` holds what
 * should be done and who holds it; `/v1/tasks` runs work that survives a crash,
 * event-sourced and replayable. They are not two spellings of one thing: a card
 * is dragged between columns and a run is replayed, and neither verb makes sense
 * on the other. So nothing here merges them — a card HANDS ITS WORK to the
 * engine, and the engine answers about the run.
 *
 * THE JOIN IS THE NAME, and it is derived rather than stored. A card started
 * from this board runs under `card-<board>-<number>`, so the workflow says which
 * card it came from and the card can find its run — with no new column on either
 * side, and nothing to fall out of step. The forge issue and the workflow are
 * still two objects in two stores; the identifier is what makes them one fact.
 */

import type { AiClient } from '@hanzo/ai'

/** The engine's default namespace. A deployment with more picks per org later. */
export const NAMESPACE = 'default'

/** One durable run, as the engine reports it. */
export interface Run {
  workflowId: string
  runId?: string
  type?: string
  status?: string
  startTime?: string
  closeTime?: string
  historyLength?: number
  taskQueue?: string
}

/** THE STATUSES the engine publishes, said the way a person would. */
export function reads(status?: string): string {
  if (!status) return 'unknown'
  return (
    {
      WORKFLOW_EXECUTION_STATUS_RUNNING: 'running',
      WORKFLOW_EXECUTION_STATUS_COMPLETED: 'done',
      WORKFLOW_EXECUTION_STATUS_FAILED: 'failed',
      WORKFLOW_EXECUTION_STATUS_CANCELED: 'canceled',
      WORKFLOW_EXECUTION_STATUS_TERMINATED: 'stopped',
      WORKFLOW_EXECUTION_STATUS_TIMED_OUT: 'timed out',
    }[status] ?? status.replace(/^WORKFLOW_EXECUTION_STATUS_/, '').toLowerCase()
  )
}

/** The workflow id a card's work runs under. Derived, never stored. */
export const runName = (board: string, number: number) => `card-${board}-${number}`

/**
 * THE QUEUE AND THE TYPE a card's work is handed to.
 *
 * `agents` because the worker that would execute it is an agent, and the engine
 * matches work to workers by queue name — one queue per kind of worker is the
 * whole of its routing. The engine ACCEPTS a start with nothing subscribed and
 * leaves the run pending, which is the honest state: the work is recorded, and
 * it moves when something is listening.
 */
export const AGENT_QUEUE = 'agents'
export const AGENT_WORKFLOW = 'AgentWorkflow'

/** Every run the engine holds, newest first as it answers. */
export async function runs(client: AiClient, signal?: AbortSignal): Promise<Run[]> {
  const out = await client.http.json<{ executions?: unknown[] }>({
    path: `/v1/tasks/namespaces/${NAMESPACE}/workflows`,
    signal,
  })
  const rows = Array.isArray(out?.executions) ? out.executions : []
  return rows.map(shape)
}

/** The run a card's work is doing, or null when it has never been started. */
export async function runOf(
  client: AiClient,
  board: string,
  number: number,
  signal?: AbortSignal,
): Promise<Run | null> {
  const name = runName(board, number)
  const out = await client.http.json<{ executions?: unknown[] }>({
    path: `/v1/tasks/namespaces/${NAMESPACE}/workflows/${encodeURIComponent(name)}/executions`,
    signal,
  })
  const rows = Array.isArray(out?.executions) ? out.executions : []
  // The chain is every attempt under that name; the newest is the one running.
  return rows.length ? shape(rows[rows.length - 1]) : null
}

/**
 * Hands a card's work to the engine.
 *
 * IT STARTS EVEN WITH NOTHING LISTENING — measured, not assumed: the engine
 * accepts the start and leaves the run RUNNING with one history event until a
 * worker polls the queue. That is the engine's own semantics and it is the
 * useful one: the work is durably recorded the moment it is handed over, and it
 * moves when something subscribes. A card therefore shows "running" for work
 * nobody is doing yet, which is true and is exactly the state worth seeing.
 *
 * `requestId` is the card's own name, so pressing twice is one run.
 */
export async function start(
  client: AiClient,
  board: string,
  number: number,
  work: { title: string; queue: string; type: string },
  signal?: AbortSignal,
): Promise<Run> {
  const out = await client.http.json<Record<string, unknown>>({
    method: 'POST',
    path: `/v1/tasks/namespaces/${NAMESPACE}/workflows`,
    body: {
      workflowId: runName(board, number),
      workflowType: { name: work.type },
      taskQueue: { name: work.queue },
      input: [{ card: `${board}#${number}`, title: work.title }],
      // The card is the request, so a double press is one run rather than two.
      requestId: runName(board, number),
    },
    signal,
  })
  return shape(out)
}

/** The engine's row, flattened to what a card needs to draw. */
function shape(row: unknown): Run {
  const r = (row ?? {}) as Record<string, any>
  const ex = (r.execution ?? {}) as Record<string, any>
  return {
    workflowId: String(ex.workflowId ?? r.workflowId ?? ''),
    runId: ex.runId ?? r.runId,
    type: r.type?.name ?? r.workflowType?.name,
    status: r.status,
    startTime: r.startTime,
    closeTime: r.closeTime,
    historyLength: r.historyLength,
    taskQueue: typeof r.taskQueue === 'string' ? r.taskQueue : r.taskQueue?.name,
  }
}
